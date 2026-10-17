// Carom — one update. Input is read first, against the screen the frame began
// on; then the screen that input left is advanced (specs/ui.md).

import type { UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { CaromState } from "./game";
import { anyPressed, driveMenu } from "./menus";
import { stepCountdown, stepPlaying } from "./simulation";
import type { FieldStep, MovementInput } from "./simulation";

/**
 * Carries the state's `muted` onto the runtime's bus, applies the `mute`
 * action, and mirrors the bus back. The bus is changed by nothing but this game,
 * so a `muted` posed through the debug surface is a request this honors.
 */
function syncMute(state: CaromState, api: UpdateApi): CaromState {
  if (api.audio.muted() !== state.muted) api.audio.setMuted(state.muted);
  if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
  return { ...state, muted: api.audio.muted() };
}

/** The movement actions held this frame, routed to paddles by mode. */
export function readMovement(
  state: DeepReadonly<CaromState>,
  api: UpdateApi,
): MovementInput {
  const value = (name: string): number => (api.input.value(name) > 0 ? 1 : 0);
  const p1Up = value("p1-up");
  const p1Down = value("p1-down");
  const p2Up = value("p2-up");
  const p2Down = value("p2-down");
  if (state.mode === "solo") {
    return {
      leftUp: Math.max(p1Up, p2Up),
      leftDown: Math.max(p1Down, p2Down),
      rightUp: 0,
      rightDown: 0,
    };
  }
  return { leftUp: p1Up, leftDown: p1Down, rightUp: p2Up, rightDown: p2Down };
}

/** The screen's own input: pausing live play, resuming, and the menus. */
function readScreenInput(state: CaromState, api: UpdateApi): CaromState {
  switch (state.screen) {
    case "countdown":
    case "playing":
      if (anyPressed(api, ["pause"])) {
        return {
          ...state,
          resumeScreen: state.screen,
          screen: "paused",
          menuIndex: 0,
        };
      }
      return state;
    case "paused":
      if (anyPressed(api, ["pause", "back"])) {
        return { ...state, screen: state.resumeScreen };
      }
      return driveMenu(state, api);
    case "title":
    case "howto":
    case "matchover":
      return driveMenu(state, api);
  }
}

export function updateFrame(
  current: DeepReadonly<CaromState>,
  api: UpdateApi,
  dt: number,
): CaromState {
  const timed = syncMute({ ...current, simTime: current.simTime + dt }, api);
  const state = readScreenInput(timed, api);

  let step: FieldStep;
  if (state.screen === "countdown") {
    step = stepCountdown(state, readMovement(state, api), dt);
  } else if (state.screen === "playing") {
    step = stepPlaying(state, readMovement(state, api), dt);
  } else return state;

  for (const cue of step.cues) api.audio.play(cue);
  return step.state;
}
