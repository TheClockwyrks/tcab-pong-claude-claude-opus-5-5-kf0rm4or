// Carom — building the state: the title screen, parking the ball, starting a
// match, and returning to the title.

import type { DeepReadonly } from "ts-essentials";
import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
} from "./game";

/** A fresh serve sign: `1` and `-1` each equally likely. */
export function drawServeSign(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}

/** The ball parked at its home point: held, still, spinless, trail-less. */
export function parkedBall(): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(),
    trail: [],
  };
}

/** Obstacle `index` at its fixed center. Throws on an index naming none. */
export function obstacleAt(index: number): ObstacleState {
  const center = OBSTACLE_CENTERS[index];
  if (!Number.isInteger(index) || center === undefined) {
    throw new RangeError(`Carom: no obstacle has index ${String(index)}`);
  }
  return { index, cx: center.x, cy: center.y };
}

export function allObstacles(): ObstacleState[] {
  return OBSTACLE_CENTERS.map((_, index) => obstacleAt(index));
}

export function restingPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

/** The whole state as the game opens on the title screen. */
export function titleState(muted: boolean): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: restingPaddle(), right: restingPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: allObstacles(),
    simTime: 0,
    muted,
  };
}

/**
 * Back to the title: every declared field at its title value, except
 * `titleIndex`, `simTime`, and `muted`, and `menuIndex` restored from
 * `titleIndex`.
 */
export function returnToTitle(state: DeepReadonly<CaromState>): CaromState {
  return {
    ...titleState(state.muted),
    titleIndex: state.titleIndex,
    menuIndex: state.titleIndex,
    simTime: state.simTime,
  };
}

function resetPaddle(paddle: DeepReadonly<PaddleState>): PaddleState {
  return { ...paddle, cy: FIELD_CY, vy: 0 };
}

/** Opens a match in `mode`, with the ball parked for the first serve. */
export function startMatch(
  state: DeepReadonly<CaromState>,
  mode: Mode,
): CaromState {
  return {
    ...state,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: resetPaddle(state.paddles.left),
      right: resetPaddle(state.paddles.right),
    },
  };
}
