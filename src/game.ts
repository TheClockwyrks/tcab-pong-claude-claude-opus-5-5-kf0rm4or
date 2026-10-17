// Carom — the game: the state it holds, the debug surface that poses and reads
// that state, and the three functions the engine drives.
//
// The state is a value. `update` builds the next state from the current one and
// `render` draws it; neither writes into what it was handed. The work itself
// lives in the modules beside this one:
//
//   state.ts       building, parking, starting a match, returning to the title
//   physics.ts     paddles, the AI, the ball's sub-stepped flight and collisions
//   simulation.ts  one countdown or playing frame of the field
//   menus.ts       the menu layouts, keyboard navigation, pointer and touch
//   frame.ts       one whole update: input first, then the screen it left
//   debug.ts       the debug and automation surface
//   render.ts      everything drawn
//   audio.ts       the cue definitions

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS, CUES } from "./constants";
import { CUE_SPECS } from "./audio";
import { createDebugApi, registerDiagnostics } from "./debug";
import type { CaromDebugApi } from "./debug";
import { updateFrame } from "./frame";
import { PALETTE } from "./palette";
import { renderFrame } from "./render";
import { titleState } from "./state";

export type { CaromDebugApi, CaromSnapshot } from "./debug";

// ---- The declared state (specs/state.md) ----------------------------------

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;
}

/** The field background; also the letterbox color `src/main.ts` clears to. */
export const BACKGROUND = PALETTE.background;

export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const name of ACTIONS) {
      api.input.register(name, { keys: [...BINDINGS[name]] });
    }
    for (const cue of Object.values(CUES)) {
      api.audio.define(cue, CUE_SPECS[cue]);
    }
    registerDiagnostics(api.diagnostics);

    // The bus starts unmuted, and only this game ever changes it.
    return [titleState(false), createDebugApi()];
  },

  update(
    state: DeepReadonly<CaromState>,
    api: UpdateApi,
    dt: number,
  ): CaromState {
    return updateFrame(state, api, dt);
  },

  render(state: DeepReadonly<CaromState>, api: RenderApi): void {
    renderFrame(state, api.ctx);
  },
};
