import { describe, expect, it } from "vitest";
import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_REACT,
  AI_SPEED,
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  OBSTACLE_CENTERS,
  OBSTACLES,
  P1_X1,
  P2_X0,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
} from "./constants";
import type { BallState, PaddleState } from "./game";
import {
  aiVelocity,
  flyBall,
  integratePaddle,
  obstacleRect,
  resolveCircleRect,
  substepCount,
} from "./physics";
import { allObstacles } from "./state";

const paddle = (cy: number, vy = 0): PaddleState => ({
  cy,
  vy,
  driven: false,
  drivenVy: 0,
});

const ball = (over: Partial<BallState>): BallState => ({
  x: 640,
  y: 360,
  vx: 0,
  vy: 0,
  spin: 0,
  held: false,
  holdTimer: 0,
  serveSign: 1,
  trail: [],
  ...over,
});

const restingPaddles = { left: paddle(360), right: paddle(360) };

describe("integratePaddle", () => {
  it("moves at vy for dt", () => {
    const next = integratePaddle(paddle(360), 720, 0.1);
    expect(next.cy).toBeCloseTo(432);
    expect(next.vy).toBe(720);
  });

  it("clamps to the field and reports the actual velocity", () => {
    const next = integratePaddle(paddle(PADDLE_MAX_CY - 6), 720, 0.1);
    expect(next.cy).toBe(PADDLE_MAX_CY);
    expect(next.vy).toBeCloseTo(60);
  });

  it("carries zero velocity while pinned against a bound", () => {
    const next = integratePaddle(paddle(PADDLE_MIN_CY), -720, 1 / 60);
    expect(next.cy).toBe(PADDLE_MIN_CY);
    expect(next.vy).toBe(0);
  });

  it("leaves vy as set when dt is zero", () => {
    const next = integratePaddle(paddle(PADDLE_MIN_CY), -720, 0);
    expect(next.cy).toBe(PADDLE_MIN_CY);
    expect(next.vy).toBe(-720);
  });
});

describe("aiVelocity", () => {
  const ai = { tracking: true, movement: true };

  it("tracks a ball coming toward it during play, leading by the lag", () => {
    const b = ball({ x: 900, y: 200, vx: 400, vy: 100 });
    const target = 200 - 100 * AI_REACT;
    const vy = aiVelocity(paddle(360), ai, "playing", b, 1 / 60);
    expect(target).toBeLessThan(360);
    expect(vy).toBe(-AI_SPEED);
  });

  it("closes a small gap within one frame without overshooting", () => {
    const b = ball({ x: 900, y: 340, vx: 400, vy: 0 });
    const vy = aiVelocity(paddle(360), ai, "playing", b, 0.1);
    expect(vy).toBeCloseTo(-200);
  });

  it("stops inside the defending deadzone", () => {
    const b = ball({ x: 900, y: 360 + AI_DEADZONE, vx: 400 });
    expect(aiVelocity(paddle(360), ai, "playing", b, 1 / 60)).toBe(0);
  });

  it("returns home when the ball moves away, the screen is not playing, or tracking is off", () => {
    const away = ball({ x: 900, y: 100, vx: -400 });
    expect(aiVelocity(paddle(500), ai, "playing", away, 1 / 60)).toBe(
      -AI_SPEED,
    );
    const toward = ball({ x: 900, y: 600, vx: 400 });
    expect(aiVelocity(paddle(500), ai, "countdown", toward, 1 / 60)).toBe(
      -AI_SPEED,
    );
    expect(
      aiVelocity(
        paddle(500),
        { tracking: false, movement: true },
        "playing",
        toward,
        1 / 60,
      ),
    ).toBe(-AI_SPEED);
    expect(aiVelocity(paddle(500), ai, "playing", null, 1 / 60)).toBe(
      -AI_SPEED,
    );
  });

  it("rests inside the home deadzone", () => {
    expect(
      aiVelocity(paddle(360 + AI_HOME_DEADZONE), ai, "playing", null, 0.016),
    ).toBe(0);
  });

  it("does not move with movement off", () => {
    const toward = ball({ x: 900, y: 600, vx: 400 });
    expect(
      aiVelocity(
        paddle(100),
        { tracking: true, movement: false },
        "playing",
        toward,
        1 / 60,
      ),
    ).toBe(0);
  });
});

describe("resolveCircleRect", () => {
  const rect = { x0: 100, y0: 100, x1: 120, y1: 240 };

  it("ignores a ball outside the expanded rectangle", () => {
    const body = { x: 100 - BALL_R, y: 150, vx: 10, vy: 0 };
    expect(resolveCircleRect(body, rect)).toBeNull();
    expect(body.x).toBe(100 - BALL_R);
  });

  it("pushes off the shallowest face and reverses an inbound normal", () => {
    const body = { x: 92, y: 170, vx: 300, vy: 20 };
    expect(resolveCircleRect(body, rect)).toBe("left");
    expect(body).toEqual({ x: 100 - BALL_R, y: 170, vx: -300, vy: 20 });

    const top = { x: 110, y: 92, vx: 5, vy: 100 };
    expect(resolveCircleRect(top, rect)).toBe("top");
    expect(top).toEqual({ x: 110, y: 100 - BALL_R, vx: 5, vy: -100 });

    const bottom = { x: 110, y: 248, vx: 5, vy: -100 };
    expect(resolveCircleRect(bottom, rect)).toBe("bottom");
    expect(bottom.vy).toBe(100);

    const right = { x: 128, y: 170, vx: -100, vy: 0 };
    expect(resolveCircleRect(right, rect)).toBe("right");
    expect(right).toEqual({ x: 120 + BALL_R, y: 170, vx: 100, vy: 0 });
  });

  it("places but keeps an outbound velocity", () => {
    const body = { x: 92, y: 170, vx: -300, vy: 0 };
    expect(resolveCircleRect(body, rect)).toBe("left");
    expect(body.vx).toBe(-300);
  });

  it("breaks a tie in the order left, right, top, bottom", () => {
    const square = { x0: 0, y0: 0, x1: 10, y1: 10 };
    // Equidistant from the left and top faces of the expanded square.
    const body = { x: -5, y: -5, vx: 1, vy: 1 };
    expect(resolveCircleRect(body, square)).toBe("left");
  });

  it("matches the supplied obstacle rectangles", () => {
    allObstacles().forEach((o, i) => {
      expect(obstacleRect(o)).toEqual(OBSTACLES[i]);
    });
  });
});

describe("flyBall", () => {
  const obstacles = allObstacles();

  it("cuts a frame into sub-steps of at most MAX_SUBSTEP units", () => {
    expect(substepCount(0, 1 / 60)).toBe(1);
    expect(substepCount(520, 1 / 60)).toBe(3);
    expect(substepCount(980, 0.1)).toBe(25);
  });

  it("flies straight with no spin", () => {
    const { ball: next } = flyBall(
      ball({ vx: 300, vy: 120 }),
      restingPaddles,
      [],
      0.1,
    );
    expect(next.x).toBeCloseTo(670);
    expect(next.y).toBeCloseTo(372);
  });

  it("curves clockwise with positive spin and keeps speed", () => {
    const { ball: next } = flyBall(
      ball({ vx: 500, spin: 600 }),
      restingPaddles,
      [],
      0.2,
    );
    expect(next.vy).toBeGreaterThan(0);
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(500);
    expect(next.spin).toBeCloseTo(600 * Math.pow(0.5, 0.2 / SPIN_HALFLIFE));
  });

  it("curves the other way with negative spin", () => {
    const { ball: next } = flyBall(
      ball({ vx: -500, spin: -600 }),
      restingPaddles,
      [],
      0.2,
    );
    // Heading -x, a negative turn swings the heading toward +y.
    expect(next.vy).toBeGreaterThan(0);
  });

  it("bounces off the top and bottom walls with speed and spin kept", () => {
    const top = flyBall(
      ball({ x: 300, y: BALL_R + 2, vx: 100, vy: -400, spin: 50 }),
      restingPaddles,
      [],
      0.05,
    );
    expect(top.events.wallBounce).toBe(true);
    expect(top.ball.vy).toBeGreaterThan(0);
    expect(top.ball.y).toBeGreaterThanOrEqual(BALL_R);

    const bottom = flyBall(
      ball({ x: 300, y: FIELD_H - BALL_R - 2, vx: 100, vy: 400 }),
      restingPaddles,
      [],
      0.05,
    );
    expect(bottom.events.wallBounce).toBe(true);
    expect(bottom.ball.vy).toBeLessThan(0);
    expect(Math.hypot(bottom.ball.vx, bottom.ball.vy)).toBeCloseTo(
      Math.hypot(100, 400),
    );
  });

  it("returns a centered hit straight across, faster, with the paddle's spin", () => {
    const { ball: next, events } = flyBall(
      ball({ x: P1_X1 + BALL_R + 2, y: 360, vx: -500, vy: 0 }),
      { left: paddle(360, 200), right: paddle(360) },
      [],
      1 / 60,
    );
    expect(events.paddleHit).toBe(true);
    expect(next.vx).toBeGreaterThan(0);
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(500 * SPEED_MULT);
    expect(next.spin).toBeLessThan(200 * SPIN_FROM_PADDLE + 1e-9);
    expect(next.spin).toBeGreaterThan(0);
  });

  it("sends an edge hit out at the maximum bounce angle", () => {
    const { ball: next } = flyBall(
      ball({ x: P2_X0 - BALL_R - 0.5, y: 360 + PADDLE_HALF, vx: 600 }),
      restingPaddles,
      [],
      0.002,
    );
    const angle = Math.atan2(next.vy, -next.vx);
    expect(angle).toBeCloseTo(MAX_BOUNCE_ANGLE);
    expect(next.x).toBeLessThanOrEqual(P2_X0 - BALL_R);
  });

  it("caps speed and clamps spin on a paddle hit", () => {
    const { ball: next } = flyBall(
      ball({ x: P2_X0 - BALL_R - 0.5, y: 360, vx: SPEED_CAP, spin: 800 }),
      { left: paddle(360), right: paddle(360, 720) },
      [],
      0.001,
    );
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(SPEED_CAP);
    expect(next.spin).toBeCloseTo(SPIN_CLAMP, 0);
  });

  it("treats an end cap like a wall", () => {
    const { ball: next, events } = flyBall(
      ball({ x: 56, y: 360 - PADDLE_HALF - BALL_R - 1, vx: 0, vy: 300 }),
      restingPaddles,
      [],
      0.02,
    );
    expect(events.wallBounce).toBe(true);
    expect(events.paddleHit).toBe(false);
    expect(next.vy).toBe(-300);
    expect(next.y).toBeLessThanOrEqual(360 - PADDLE_HALF - BALL_R);
  });

  it("banks off an obstacle with speed and spin unchanged", () => {
    const a = OBSTACLE_CENTERS[0];
    const { ball: next, events } = flyBall(
      ball({ x: a.x - 10 - BALL_R - 2, y: a.y, vx: 600, vy: 0, spin: 0 }),
      restingPaddles,
      obstacles,
      1 / 60,
    );
    expect(events.obstacleBounce).toBe(true);
    expect(next.vx).toBe(-600);
    expect(next.spin).toBe(0);
  });

  it("passes through where an obstacle is absent", () => {
    const a = OBSTACLE_CENTERS[0];
    const { events } = flyBall(
      ball({ x: a.x - 30, y: a.y, vx: 600 }),
      restingPaddles,
      [],
      0.1,
    );
    expect(events.obstacleBounce).toBe(false);
  });

  it("never tunnels into an obstacle at the speed cap", () => {
    const a = OBSTACLES[0];
    for (const dt of [0.002, 0.016, 0.1]) {
      const { ball: next } = flyBall(
        ball({ x: a.x0 - 60, y: 220, vx: SPEED_CAP }),
        restingPaddles,
        obstacles,
        dt,
      );
      const inside =
        next.x > a.x0 - BALL_R &&
        next.x < a.x1 + BALL_R &&
        next.y > a.y0 - BALL_R &&
        next.y < a.y1 + BALL_R;
      expect(inside).toBe(false);
    }
  });
});
