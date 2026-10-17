// Carom — the menus: what each menu screen offers, where each item sits, and how
// the keyboard, a pointer, and touch drive them (specs/ui.md).

import type { UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { ActionName } from "./constants";
import type { CaromState, Screen } from "./game";
import { returnToTitle, startMatch } from "./state";

/** The how-to screen's single item, which returns to the title. */
export const HOWTO_ITEMS = ["BACK TO MENU"] as const;

export interface MenuRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const MENU_ITEM_W = 380;
export const MENU_ITEM_H = 56;
const MENU_ITEM_GAP = 16;

/** Each menu's items and the center y of its first item. */
const MENUS: Partial<
  Record<Screen, { readonly items: readonly string[]; readonly top: number }>
> = {
  title: { items: TITLE_ITEMS, top: 388 },
  howto: { items: HOWTO_ITEMS, top: 636 },
  paused: { items: PAUSE_ITEMS, top: 352 },
  matchover: { items: MATCHOVER_ITEMS, top: 452 },
};

/** The items the menu on `screen` shows; none on `countdown` and `playing`. */
export function menuItems(screen: Screen): readonly string[] {
  return MENUS[screen]?.items ?? [];
}

/** The hit region of item `index` on `screen`'s menu, or `null` for none. */
export function menuRect(screen: Screen, index: number): MenuRect | null {
  const menu = MENUS[screen];
  if (menu === undefined || !Number.isInteger(index)) return null;
  if (index < 0 || index >= menu.items.length) return null;
  const cy = menu.top + index * (MENU_ITEM_H + MENU_ITEM_GAP);
  return {
    x: FIELD_CX - MENU_ITEM_W / 2,
    y: cy - MENU_ITEM_H / 2,
    w: MENU_ITEM_W,
    h: MENU_ITEM_H,
  };
}

/** The item whose region holds `(x, y)` on `screen`, or `-1` for none. */
export function itemAt(screen: Screen, x: number, y: number): number {
  const count = menuItems(screen).length;
  for (let index = 0; index < count; index++) {
    const rect = menuRect(screen, index);
    if (
      rect !== null &&
      x >= rect.x &&
      x <= rect.x + rect.w &&
      y >= rect.y &&
      y <= rect.y + rect.h
    ) {
      return index;
    }
  }
  return -1;
}

/** Confirms the item at `menuIndex` on the menu now showing. */
export function confirmItem(state: DeepReadonly<CaromState>): CaromState {
  const index = state.menuIndex;
  switch (state.screen) {
    case "title":
      if (index === 0) return { ...startMatch(state, "solo"), titleIndex: 0 };
      if (index === 1) return { ...startMatch(state, "versus"), titleIndex: 1 };
      if (index === 2) {
        return { ...state, screen: "howto", menuIndex: 0, titleIndex: 2 };
      }
      break;
    case "howto":
      if (index === 0) return returnToTitle(state);
      break;
    case "paused":
      if (index === 0) return { ...state, screen: state.resumeScreen };
      if (index === 1) return startMatch(state, state.mode);
      if (index === 2) return returnToTitle(state);
      break;
    case "matchover":
      if (index === 0) return startMatch(state, state.mode);
      if (index === 1) return returnToTitle(state);
      break;
    default:
      break;
  }
  return { ...state };
}

function wrap(index: number, delta: number, count: number): number {
  return (((index + delta) % count) + count) % count;
}

/**
 * Reads every named edge, consuming each, and reports whether any fired. All
 * of them are read so that none survives to be misread later in the frame.
 */
export function anyPressed(
  api: UpdateApi,
  names: readonly ActionName[],
): boolean {
  return names.map((name) => api.input.pressed(name)).some(Boolean);
}

// ---- Pointer and touch -----------------------------------------------------

/**
 * A pointer or touch contact that went down on a menu, and the item it landed
 * on (`-1` for none), so that its release can tell whether both of its edges
 * fell inside one item's region. This is input bookkeeping rather than game
 * state: the snapshot does not report it, a reset discards it, and a press is
 * forgotten once its screen is gone.
 */
export interface MenuPress {
  readonly id: number;
  readonly index: number;
  readonly screen: Screen;
}

/** The bookkeeping a state carries beside its declared fields. */
interface PressBook {
  readonly menuPresses?: readonly MenuPress[];
}

export function pressesOf(
  state: DeepReadonly<CaromState>,
): readonly MenuPress[] {
  return (state as DeepReadonly<CaromState> & PressBook).menuPresses ?? [];
}

function withPresses(
  state: CaromState,
  presses: readonly MenuPress[],
): CaromState {
  const next: CaromState & PressBook = {
    ...state,
    menuPresses: presses.filter((press) => press.screen === state.screen),
  };
  return next;
}

/**
 * Applies the frame's pointer and touch samples to the menu on screen: a sample
 * over an item selects it, and a contact that lands and lifts inside one item's
 * region confirms it.
 */
export function applyPointer(
  state: DeepReadonly<CaromState>,
  api: UpdateApi,
): CaromState {
  const screen = state.screen;
  let presses = pressesOf(state);
  let menuIndex = state.menuIndex;
  for (const sample of api.input.pointerSamples()) {
    const hit = itemAt(screen, sample.x, sample.y);
    if (hit >= 0) menuIndex = hit;
    if (sample.type === "down" && sample.button === "primary") {
      presses = [
        ...presses.filter((press) => press.id !== sample.id),
        { id: sample.id, index: hit, screen },
      ];
    } else if (sample.type === "up") {
      const press = presses.find((p) => p.id === sample.id);
      presses = presses.filter((p) => p.id !== sample.id);
      if (press && press.screen === screen && press.index >= 0) {
        if (press.index === hit) {
          const confirmed = confirmItem({ ...state, menuIndex: hit });
          return withPresses(confirmed, presses);
        }
      }
    }
  }
  return withPresses({ ...state, menuIndex }, presses);
}

// ---- Keyboard --------------------------------------------------------------

const UP: readonly ActionName[] = ["p1-up", "p2-up"];
const DOWN: readonly ActionName[] = ["p1-down", "p2-down"];

/**
 * A menu screen's frame of input: up before down, movement before confirm,
 * then the pointer and touch samples.
 */
export function driveMenu(
  state: DeepReadonly<CaromState>,
  api: UpdateApi,
): CaromState {
  const count = menuItems(state.screen).length;
  const up = anyPressed(api, UP);
  const down = anyPressed(api, DOWN);
  const confirm = anyPressed(api, ["confirm"]);
  const back = anyPressed(api, ["back"]);

  if (state.screen === "howto" && (confirm || back)) {
    return returnToTitle(state);
  }
  if (state.screen === "matchover" && back) return returnToTitle(state);

  let next: CaromState = { ...state };
  if (count > 0 && (up || down)) {
    next = { ...next, menuIndex: wrap(state.menuIndex, up ? -1 : 1, count) };
  } else if (confirm) {
    return confirmItem(state);
  }
  return applyPointer(next, api);
}
