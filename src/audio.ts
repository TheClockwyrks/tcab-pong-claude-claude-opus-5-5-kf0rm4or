// Carom — the cue definitions. Each event is a distinct short blip, so the four
// are told apart by ear: a bright square tick off a paddle, a soft low sine off
// a wall, a hollow triangle knock off an obstacle, and a rising sweep on a point.

import type { CueSpec } from "@clockwyrks/simple-2d";
import { CUES } from "./constants";
import type { CueName } from "./constants";

export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  [CUES.paddleHit]: {
    wave: "square",
    freq: 660,
    freqTo: 880,
    gain: 0.12,
    durationMs: 70,
  },
  [CUES.wallBounce]: {
    wave: "sine",
    freq: 300,
    freqTo: 220,
    gain: 0.2,
    durationMs: 60,
  },
  [CUES.obstacleBounce]: {
    wave: "triangle",
    freq: 480,
    freqTo: 360,
    gain: 0.22,
    durationMs: 90,
  },
  [CUES.score]: {
    wave: "sawtooth",
    freq: 330,
    freqTo: 990,
    gain: 0.1,
    durationMs: 260,
  },
};
