// Carom — the render-free core: paddle integration, the AI's rule, and the
// ball's sub-stepped flight with its collisions (specs/balls.md,
// specs/playfield.md, specs/modes/single-player.md).
//
// Everything here is a pure function of its arguments and the delta time it is
// handed, so the same interval of game time reaches the same result however it
// was divided into frames.

import type { DeepReadonly } from "ts-essentials";
import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLE_HH,
  OBSTACLE_HW,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
} from "./constants";
import type { Rect } from "./constants";
import type {
  AiState,
  BallState,
  ObstacleState,
  PaddleState,
  Screen,
} from "./game";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---- Paddles -------------------------------------------------------------

/**
 * Moves a paddle at `vy` for `dt` seconds and clamps it to the field. The `vy`
 * left behind is the paddle's actual velocity for the frame, so a paddle pinned
 * against a bound carries `0`.
 */
export function integratePaddle(
  paddle: DeepReadonly<PaddleState>,
  vy: number,
  dt: number,
): PaddleState {
  const next = clamp(paddle.cy + vy * dt, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const actualVy =
    next !== paddle.cy + vy * dt && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actualVy };
}

/**
 * The AI's velocity for this frame. It tracks where the ball is heading while
 * the ball comes toward it in live play, and drifts home otherwise.
 */
export function aiVelocity(
  paddle: DeepReadonly<PaddleState>,
  ai: DeepReadonly<AiState>,
  screen: Screen,
  ball: DeepReadonly<BallState> | null,
  dt: number,
): number {
  if (!ai.movement) return 0;
  let target = AI_HOME_Y;
  let deadzone = AI_HOME_DEADZONE;
  if (ai.tracking && screen === "playing" && ball !== null && ball.vx > 0) {
    target = ball.y - ball.vy * AI_REACT;
    deadzone = AI_DEADZONE;
  }
  const diff = target - paddle.cy;
  if (Math.abs(diff) <= deadzone) return 0;
  const reach = dt > 0 ? Math.abs(diff) / dt : AI_SPEED;
  return Math.sign(diff) * Math.min(AI_SPEED, reach);
}

// ---- Collision -----------------------------------------------------------

export type Face = "left" | "right" | "top" | "bottom";

/** The minimal mutable body the sub-step loop works on. */
interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Resolves the ball against an axis-aligned rectangle: pushes it `BALL_R` off
 * the struck face and reverses the normal component if it points into that
 * face. Returns the struck face, or `null` when the ball does not overlap.
 */
export function resolveCircleRect(body: Body, rect: Rect): Face | null {
  const ex0 = rect.x0 - BALL_R;
  const ex1 = rect.x1 + BALL_R;
  const ey0 = rect.y0 - BALL_R;
  const ey1 = rect.y1 + BALL_R;
  if (!(body.x > ex0 && body.x < ex1 && body.y > ey0 && body.y < ey1)) {
    return null;
  }
  const depths: readonly [Face, number][] = [
    ["left", body.x - ex0],
    ["right", ex1 - body.x],
    ["top", body.y - ey0],
    ["bottom", ey1 - body.y],
  ];
  let [face, least] = depths[0];
  for (const [candidate, depth] of depths) {
    if (depth < least) [face, least] = [candidate, depth];
  }
  switch (face) {
    case "left":
      body.x = ex0;
      if (body.vx > 0) body.vx = -body.vx;
      break;
    case "right":
      body.x = ex1;
      if (body.vx < 0) body.vx = -body.vx;
      break;
    case "top":
      body.y = ey0;
      if (body.vy > 0) body.vy = -body.vy;
      break;
    case "bottom":
      body.y = ey1;
      if (body.vy < 0) body.vy = -body.vy;
      break;
  }
  return face;
}

export function paddleRect(side: "left" | "right", cy: number): Rect {
  const [x0, x1] = side === "left" ? [P1_X0, P1_X1] : [P2_X0, P2_X1];
  return { x0, x1, y0: cy - PADDLE_HALF, y1: cy + PADDLE_HALF };
}

export function obstacleRect(obstacle: DeepReadonly<ObstacleState>): Rect {
  return {
    x0: obstacle.cx - OBSTACLE_HW,
    x1: obstacle.cx + OBSTACLE_HW,
    y0: obstacle.cy - OBSTACLE_HH,
    y1: obstacle.cy + OBSTACLE_HH,
  };
}

// ---- The ball ------------------------------------------------------------

/** What a frame's flight touched, so each cue plays once per frame. */
export interface FlightEvents {
  paddleHit: boolean;
  wallBounce: boolean;
  obstacleBounce: boolean;
}

export interface FlightResult {
  readonly ball: BallState;
  readonly events: FlightEvents;
}

/** The paddles as the ball sees them: center and the frame's integrated vy. */
export interface PaddlePair {
  readonly left: DeepReadonly<PaddleState>;
  readonly right: DeepReadonly<PaddleState>;
}

/** The sub-step count for a frame: at most `MAX_SUBSTEP` units per step. */
export function substepCount(speed: number, dt: number): number {
  return Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP));
}

/**
 * A paddle hit: the outgoing angle from where the ball met the paddle, the
 * speed-up, the spin the paddle's motion adds, and the placement in front of
 * the face.
 */
function paddleBounce(
  body: Body,
  spin: number,
  side: "left" | "right",
  paddle: DeepReadonly<PaddleState>,
): number {
  const offset = clamp((body.y - paddle.cy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(Math.hypot(body.vx, body.vy) * SPEED_MULT, SPEED_CAP);
  const dir = side === "left" ? 1 : -1;
  body.vx = dir * speed * Math.cos(theta);
  body.vy = speed * Math.sin(theta);
  body.x = side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R;
  return clamp(spin + paddle.vy * SPIN_FROM_PADDLE, -SPIN_CLAMP, SPIN_CLAMP);
}

/**
 * Advances the ball one frame of `dt` seconds in sub-steps, curving it by its
 * spin and resolving the walls, both paddles, and every present obstacle.
 */
export function flyBall(
  ball: DeepReadonly<BallState>,
  paddles: PaddlePair,
  obstacles: readonly DeepReadonly<ObstacleState>[],
  dt: number,
): FlightResult {
  const body: Body = { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy };
  let spin = ball.spin;
  const events: FlightEvents = {
    paddleHit: false,
    wallBounce: false,
    obstacleBounce: false,
  };
  const rects = obstacles.map(obstacleRect);
  const n = substepCount(Math.hypot(ball.vx, ball.vy), dt);
  const h = dt / n;
  const decay = Math.pow(0.5, h / SPIN_HALFLIFE);

  for (let step = 0; step < n; step++) {
    // 1. Spin turns the velocity, clockwise on screen for positive spin.
    const speed = Math.hypot(body.vx, body.vy);
    if (speed > 0) {
      const angle = (spin / speed) * h;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const vx = body.vx * cos - body.vy * sin;
      body.vy = body.vx * sin + body.vy * cos;
      body.vx = vx;
    }
    // 2. Spin decays.
    spin *= decay;
    // 3. Advance.
    body.x += body.vx * h;
    body.y += body.vy * h;
    // 4. Walls, left paddle, right paddle, obstacle A, obstacle B.
    if (body.y - BALL_R < 0 && body.vy < 0) {
      body.y = BALL_R;
      body.vy = -body.vy;
      events.wallBounce = true;
    } else if (body.y + BALL_R > FIELD_H && body.vy > 0) {
      body.y = FIELD_H - BALL_R;
      body.vy = -body.vy;
      events.wallBounce = true;
    }
    for (const side of ["left", "right"] as const) {
      const paddle = paddles[side];
      const face = resolveCircleRect(body, paddleRect(side, paddle.cy));
      if (face === "left" || face === "right") {
        spin = paddleBounce(body, spin, side, paddle);
        events.paddleHit = true;
      } else if (face !== null) {
        events.wallBounce = true;
      }
    }
    for (const rect of rects) {
      if (resolveCircleRect(body, rect) !== null) events.obstacleBounce = true;
    }
  }

  return { ball: { ...ball, ...body, spin }, events };
}
