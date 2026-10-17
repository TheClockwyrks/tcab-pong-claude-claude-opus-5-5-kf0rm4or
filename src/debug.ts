// Carom — the debug and automation surface (specs/instrumentation.md), and the
// diagnostic sources the runtime's overlay shows.
//
// Every operation is written in the shape of `update`: it takes the current
// state, read-only, and either returns the next state (a pose) or returns what
// it read (a reading). Nothing here holds a state of its own.

import type { InitApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { CAROM_DEBUG_VERSION } from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  PaddleState,
  Screen,
  Side,
} from "./game";
import { menuRect } from "./menus";
import type { MenuRect } from "./menus";
import { drawServeSign, obstacleAt, parkedBall, titleState } from "./state";

type View = DeepReadonly<CaromState>;

export interface PaddleSnapshot {
  cy: number;
  vy: number;
  drivenVy: number;
  driven: boolean;
}

export interface BallSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  spin: number;
  held: boolean;
  holdTimer: number;
  serveSign: 1 | -1;
  trail: { x: number; y: number; t: number }[];
}

/** The whole declared state, as `snapshot` reports it. */
export interface CaromSnapshot {
  version: number;
  screen: Screen;
  mode: Mode;
  menuIndex: number;
  titleIndex: number;
  resumeScreen: "countdown" | "playing";
  score: { p1: number; p2: number };
  winner: Side | null;
  muted: boolean;
  paddles: { left: PaddleSnapshot; right: PaddleSnapshot };
  ai: { tracking: boolean; movement: boolean };
  receiver: Side;
  ball: BallSnapshot | null;
  obstacles: { index: number; cx: number; cy: number }[];
  simTime: number;
}

export interface CaromDebugApi {
  readonly version: number;

  // The world
  clearWorld(state: View): CaromState;
  spawnBall(state: View): CaromState;
  spawnObstacle(state: View, index: number): CaromState;
  reset(state: View): CaromState;
  reconcile(state: View): CaromState;

  // Screens and menus
  setScreen(state: View, screen: Screen): CaromState;
  setMode(state: View, mode: Mode): CaromState;
  setMenuIndex(state: View, index: number): CaromState;
  setTitleIndex(state: View, index: number): CaromState;
  setResumeScreen(state: View, screen: "countdown" | "playing"): CaromState;

  // Match state
  setScore(state: View, p1: number, p2: number): CaromState;
  setWinner(state: View, side: Side | null): CaromState;
  setReceiver(state: View, side: Side): CaromState;

  // Paddles
  setPaddleCy(state: View, side: Side, cy: number): CaromState;
  setPaddleVy(state: View, side: Side, vy: number): CaromState;
  setPaddleDriven(state: View, side: Side, driven: boolean): CaromState;

  // The ball
  setBallPosition(state: View, x: number, y: number): CaromState;
  setBallVelocity(state: View, vx: number, vy: number): CaromState;
  setBallSpin(state: View, spin: number): CaromState;
  setBallHeld(state: View, held: boolean): CaromState;
  setBallHoldTimer(state: View, seconds: number): CaromState;
  setBallServeSign(state: View, sign: 1 | -1): CaromState;
  drawBallServeSign(state: View): CaromState;

  // The AI opponent
  setAiTracking(state: View, enabled: boolean): CaromState;
  setAiMovement(state: View, enabled: boolean): CaromState;

  // Audio
  setMuted(state: View, muted: boolean): CaromState;

  // Readings
  snapshot(state: View): CaromSnapshot;
  menuItemRect(state: View, index: number): MenuRect | null;
}

// ---- Argument checks: a pose never refuses quietly -------------------------

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

function fail(message: string): never {
  throw new Error(`Carom debug: ${message}`);
}

function finite(value: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${name} must be a finite number, not ${String(value)}`);
  }
  return value;
}

function whole(value: number, name: string): number {
  if (!Number.isInteger(value)) {
    fail(`${name} must be a whole number, not ${String(value)}`);
  }
  return value;
}

function flag(value: boolean, name: string): boolean {
  if (typeof value !== "boolean") {
    fail(`${name} must be a boolean, not ${String(value)}`);
  }
  return value;
}

function side(value: Side): Side {
  if (value !== "left" && value !== "right") {
    fail(`side must be "left" or "right", not ${String(value)}`);
  }
  return value;
}

function screen(value: Screen): Screen {
  if (!SCREENS.includes(value)) fail(`unknown screen ${String(value)}`);
  return value;
}

// ---- Pose helpers ------------------------------------------------------------

function withBall(
  state: View,
  change: (ball: DeepReadonly<BallState>) => Partial<BallState>,
): CaromState {
  const ball = state.ball;
  if (ball === null) fail("the field carries no ball to set");
  return { ...state, ball: { ...ball, ...change(ball) } };
}

function withPaddle(
  state: View,
  which: Side,
  change: Partial<PaddleState>,
): CaromState {
  const key = side(which);
  return {
    ...state,
    paddles: {
      ...state.paddles,
      [key]: { ...state.paddles[key], ...change },
    },
  };
}

// ---- Readings ----------------------------------------------------------------

export function snapshotOf(state: View): CaromSnapshot {
  const paddle = (p: DeepReadonly<PaddleState>): PaddleSnapshot => ({
    cy: p.cy,
    vy: p.vy,
    drivenVy: p.drivenVy,
    driven: p.driven,
  });
  const ball = state.ball;
  return {
    version: CAROM_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    resumeScreen: state.resumeScreen,
    score: { p1: state.score.p1, p2: state.score.p2 },
    winner: state.winner,
    muted: state.muted,
    paddles: {
      left: paddle(state.paddles.left),
      right: paddle(state.paddles.right),
    },
    ai: { tracking: state.ai.tracking, movement: state.ai.movement },
    receiver: state.receiver,
    ball:
      ball === null
        ? null
        : {
            x: ball.x,
            y: ball.y,
            vx: ball.vx,
            vy: ball.vy,
            speed: Math.hypot(ball.vx, ball.vy),
            spin: ball.spin,
            held: ball.held,
            holdTimer: ball.holdTimer,
            serveSign: ball.serveSign,
            trail: ball.trail.map(({ x, y, t }) => ({ x, y, t })),
          },
    obstacles: state.obstacles.map(({ index, cx, cy }) => ({ index, cx, cy })),
    simTime: state.simTime,
  };
}

// ---- The surface ---------------------------------------------------------------

export function createDebugApi(): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,

    clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }),
    spawnBall: (s) => ({ ...s, ball: parkedBall() }),
    spawnObstacle: (s, index) => {
      const placed = obstacleAt(index);
      const others = s.obstacles.filter((o) => o.index !== placed.index);
      return {
        ...s,
        obstacles: [...others, placed].sort((a, b) => a.index - b.index),
      };
    },
    // The title state places the ball and both obstacles exactly as
    // `spawnBall` and `spawnObstacle` do; the mute bit is left alone.
    reset: (s) => titleState(s.muted),
    // Every reading is worked out at the read, so there is no stored copy to
    // bring back into agreement.
    reconcile: (s) => ({ ...s }),

    setScreen: (s, next) => ({ ...s, screen: screen(next) }),
    setMode: (s, mode) => {
      if (mode !== "solo" && mode !== "versus") {
        fail(`unknown mode ${String(mode)}`);
      }
      return { ...s, mode };
    },
    setMenuIndex: (s, index) => ({
      ...s,
      menuIndex: whole(index, "menu index"),
    }),
    setTitleIndex: (s, index) => ({
      ...s,
      titleIndex: whole(index, "title index"),
    }),
    setResumeScreen: (s, next) => {
      if (next !== "countdown" && next !== "playing") {
        fail(`a pause resumes to countdown or playing, not ${String(next)}`);
      }
      return { ...s, resumeScreen: next };
    },

    setScore: (s, p1, p2) => ({
      ...s,
      score: { p1: whole(p1, "p1 score"), p2: whole(p2, "p2 score") },
    }),
    setWinner: (s, winner) => ({
      ...s,
      winner: winner === null ? null : side(winner),
    }),
    setReceiver: (s, receiver) => ({ ...s, receiver: side(receiver) }),

    setPaddleCy: (s, which, cy) =>
      withPaddle(s, which, { cy: finite(cy, "paddle cy") }),
    setPaddleVy: (s, which, vy) =>
      withPaddle(s, which, { drivenVy: finite(vy, "paddle vy") }),
    setPaddleDriven: (s, which, driven) =>
      withPaddle(s, which, { driven: flag(driven, "driven") }),

    setBallPosition: (s, x, y) =>
      withBall(s, () => ({ x: finite(x, "ball x"), y: finite(y, "ball y") })),
    setBallVelocity: (s, vx, vy) =>
      withBall(s, () => ({
        vx: finite(vx, "ball vx"),
        vy: finite(vy, "ball vy"),
      })),
    setBallSpin: (s, spin) =>
      withBall(s, () => ({ spin: finite(spin, "ball spin") })),
    setBallHeld: (s, held) => withBall(s, () => ({ held: flag(held, "held") })),
    setBallHoldTimer: (s, seconds) =>
      withBall(s, () => ({ holdTimer: finite(seconds, "hold timer") })),
    setBallServeSign: (s, sign) =>
      withBall(s, () => {
        if (sign !== 1 && sign !== -1) {
          fail(`serve sign must be 1 or -1, not ${String(sign)}`);
        }
        return { serveSign: sign };
      }),
    drawBallServeSign: (s) =>
      withBall(s, () => ({ serveSign: drawServeSign() })),

    setAiTracking: (s, enabled) => ({
      ...s,
      ai: { ...s.ai, tracking: flag(enabled, "tracking") },
    }),
    setAiMovement: (s, enabled) => ({
      ...s,
      ai: { ...s.ai, movement: flag(enabled, "movement") },
    }),

    setMuted: (s, muted) => ({ ...s, muted: flag(muted, "muted") }),

    snapshot: snapshotOf,
    menuItemRect: (s, index) => menuRect(s.screen, index),
  };
}

// ---- Diagnostics ---------------------------------------------------------------

const fmt = (value: number): string => value.toFixed(1);

/** Registers the overlay's sources: pure reads of the state they are handed. */
export function registerDiagnostics(
  diagnostics: InitApi<CaromState>["diagnostics"],
): void {
  diagnostics.register("screen", (s) => s.screen);
  diagnostics.register("mode", (s) => s.mode);
  diagnostics.register("score", (s) => `${s.score.p1} - ${s.score.p2}`);
  diagnostics.register("ball pos", (s) =>
    s.ball === null ? "none" : `${fmt(s.ball.x)}, ${fmt(s.ball.y)}`,
  );
  diagnostics.register("ball vel", (s) =>
    s.ball === null ? "none" : `${fmt(s.ball.vx)}, ${fmt(s.ball.vy)}`,
  );
  diagnostics.register("ball speed", (s) =>
    s.ball === null ? "none" : fmt(Math.hypot(s.ball.vx, s.ball.vy)),
  );
  diagnostics.register("ball spin", (s) =>
    s.ball === null ? "none" : fmt(s.ball.spin),
  );
  diagnostics.register(
    "left paddle",
    (s) => `cy ${fmt(s.paddles.left.cy)} vy ${fmt(s.paddles.left.vy)}`,
  );
  diagnostics.register(
    "right paddle",
    (s) => `cy ${fmt(s.paddles.right.cy)} vy ${fmt(s.paddles.right.vy)}`,
  );
}
