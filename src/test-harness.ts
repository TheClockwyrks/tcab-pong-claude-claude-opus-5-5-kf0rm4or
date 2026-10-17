// Carom — a test harness: the real engine over a native canvas and a clock of
// the test's own, with helpers that drive the keyboard and the pointer exactly
// as a player's events do. Used by the `*.test.ts` files beside it.

import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Clock, Engine, SurfaceMetrics } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "./constants";
import { BACKGROUND, game } from "./game";
import type { CaromDebugApi, CaromState } from "./game";

export type CaromEngine = Engine<CaromState, CaromDebugApi>;

export interface Harness {
  readonly engine: CaromEngine;
  readonly debug: CaromDebugApi;
  readonly cues: string[];
  /** Applies a pose of the debug surface. */
  pose(
    transition: (debug: CaromDebugApi, s: CaromEngine["state"]) => CaromState,
  ): void;
  keyDown(code: string): void;
  keyUp(code: string): void;
  /** A press and release of `code` that lands before the next frame. */
  tap(code: string): void;
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    options?: { id?: number; device?: "mouse" | "touch" },
  ): void;
  advance(frames: number): Promise<void>;
}

/** Builds an engine over a 1280x720 surface at a device pixel ratio of 1. */
export async function createHarness(
  clock: Clock = new ConstantClock(1000 / 60),
): Promise<Harness> {
  const target = new EventTarget();
  const surface: SurfaceMetrics = {
    cssWidth: () => FIELD_W,
    cssHeight: () => FIELD_H,
    dpr: () => 1,
    events: () => target,
  };
  const canvas = createCanvas(FIELD_W, FIELD_H) as unknown as HTMLCanvasElement;
  const engine = createEngine({
    canvas,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock,
    surface,
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (event) => cues.push(event.cue));
  await engine.initialize();

  const key = (type: string, code: string): void => {
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  };
  const buttonsDown = new Map<number, boolean>();

  return {
    engine,
    debug: engine.debug,
    cues,
    pose: (transition) => {
      engine.apply((s) => transition(engine.debug, s));
    },
    keyDown: (code) => key("keydown", code),
    keyUp: (code) => key("keyup", code),
    tap: (code) => {
      key("keydown", code);
      key("keyup", code);
    },
    pointer: (type, x, y, options = {}) => {
      const id = options.id ?? 1;
      if (type === "pointerdown") buttonsDown.set(id, true);
      if (type === "pointerup") buttonsDown.set(id, false);
      target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: id,
          pointerType: options.device ?? "mouse",
          isPrimary: id === 1,
          button: type === "pointermove" ? -1 : 0,
          buttons: buttonsDown.get(id) ? 1 : 0,
        }),
      );
    },
    advance: (frames) => engine.advance(frames),
  };
}
