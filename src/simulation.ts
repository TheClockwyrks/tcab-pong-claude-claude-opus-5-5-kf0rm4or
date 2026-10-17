// Carom — one advanced frame of the field: the countdown before a serve, and
// live play with its scoring (specs/balls.md, specs/ui.md).

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  CUES,
  FIELD_W,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  TRAIL_TIME,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import type { CueName } from "./constants";
import type { BallState, CaromState, Side } from "./game";
import { aiVelocity, flyBall, integratePaddle } from "./physics";
import { parkedBall } from "./state";

/** How far each paddle's movement actions are held this frame, `0` or `1`. */
export interface MovementInput {
  readonly leftUp: number;
  readonly leftDown: number;
  readonly rightUp: number;
  readonly rightDown: number;
}

/** A frame's outcome: the next state and the cues it raised, once each. */
export interface FieldStep {
  readonly state: CaromState;
  readonly cues: readonly CueName[];
}

/** Moves both paddles: driven, under a player, or under the AI. */
export function movePaddles(
  state: DeepReadonly<CaromState>,
  input: MovementInput,
  dt: number,
): CaromState["paddles"] {
  const { left, right } = state.paddles;
  const leftVy = left.driven
    ? left.drivenVy
    : (input.leftDown - input.leftUp) * PADDLE_SPEED;
  let rightVy: number;
  if (right.driven) rightVy = right.drivenVy;
  else if (state.mode === "solo") {
    rightVy = aiVelocity(right, state.ai, state.screen, state.ball, dt);
  } else rightVy = (input.rightDown - input.rightUp) * PADDLE_SPEED;
  return {
    left: integratePaddle(left, leftVy, dt),
    right: integratePaddle(right, rightVy, dt),
  };
}

/** Appends the ball's position and drops every sample older than the trail. */
function recordTrail(
  ball: DeepReadonly<BallState>,
  simTime: number,
): BallState {
  const trail = [...ball.trail, { x: ball.x, y: ball.y, t: simTime }].filter(
    (sample) => simTime - sample.t <= TRAIL_TIME,
  );
  return { ...ball, trail };
}

/** The ball leaving its home point toward `receiver`. */
function serve(ball: DeepReadonly<BallState>, receiver: Side): BallState {
  const dir = receiver === "left" ? -1 : 1;
  return {
    ...ball,
    held: false,
    holdTimer: 0,
    trail: [],
    vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
    vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
  };
}

function hasWon(score: number, other: number): boolean {
  return score >= WIN_SCORE && score - other >= WIN_LEAD;
}

/** A countdown frame: the paddles move and the hold runs down to the serve. */
export function stepCountdown(
  state: DeepReadonly<CaromState>,
  input: MovementInput,
  dt: number,
): FieldStep {
  const paddles = movePaddles(state, input, dt);
  if (state.ball === null) return { state: { ...state, paddles }, cues: [] };

  const holdTimer = state.ball.holdTimer - dt;
  const ball = recordTrail({ ...state.ball, holdTimer }, state.simTime);
  if (holdTimer > 0) return { state: { ...state, paddles, ball }, cues: [] };
  return {
    state: {
      ...state,
      paddles,
      ball: serve(ball, state.receiver),
      screen: "playing",
    },
    cues: [],
  };
}

/** A playing frame: the paddles move, the ball flies, and a goal scores. */
export function stepPlaying(
  state: DeepReadonly<CaromState>,
  input: MovementInput,
  dt: number,
): FieldStep {
  const paddles = movePaddles(state, input, dt);
  if (state.ball === null) return { state: { ...state, paddles }, cues: [] };

  const flight = flyBall(state.ball, paddles, state.obstacles, dt);
  const ball = recordTrail(flight.ball, state.simTime);
  const cues: CueName[] = [];
  if (flight.events.paddleHit) cues.push(CUES.paddleHit);
  if (flight.events.wallBounce) cues.push(CUES.wallBounce);
  if (flight.events.obstacleBounce) cues.push(CUES.obstacleBounce);

  let scorer: Side | null = null;
  if (ball.x - BALL_R > FIELD_W) scorer = "left";
  else if (ball.x + BALL_R < 0) scorer = "right";
  if (scorer === null) return { state: { ...state, paddles, ball }, cues };

  cues.push(CUES.score);
  const score = {
    p1: state.score.p1 + (scorer === "left" ? 1 : 0),
    p2: state.score.p2 + (scorer === "right" ? 1 : 0),
  };
  const won =
    scorer === "left" ? hasWon(score.p1, score.p2) : hasWon(score.p2, score.p1);
  if (won) {
    return {
      state: {
        ...state,
        paddles,
        ball,
        score,
        winner: scorer,
        screen: "matchover",
        menuIndex: 0,
      },
      cues,
    };
  }
  return {
    state: {
      ...state,
      paddles,
      score,
      ball: parkedBall(),
      receiver: scorer === "left" ? "right" : "left",
      screen: "countdown",
    },
    cues,
  };
}
