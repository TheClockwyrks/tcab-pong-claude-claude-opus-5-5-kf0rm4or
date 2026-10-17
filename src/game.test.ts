import { ConstantClock } from "@clockwyrks/simple-2d";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTIONS,
  BALL_R,
  CUES,
  FIELD_CX,
  FIELD_CY,
  FIELD_W,
  HOLD_TIME,
  P1_X1,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  TRAIL_TIME,
} from "./constants";
import { BACKGROUND } from "./game";
import { startMatch } from "./state";
import type { Harness } from "./test-harness";
import { createHarness } from "./test-harness";

const DT = 1 / 60;

function snap(h: Harness) {
  return h.debug.snapshot(h.engine.state);
}

/** A harness whose match has just started in `mode`, on the countdown. */
async function inMatch(mode: "solo" | "versus"): Promise<Harness> {
  const h = await createHarness();
  h.pose((_, s) => startMatch(s, mode));
  return h;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("opening", () => {
  it("opens on the title screen with the declared values", async () => {
    const h = await createHarness();
    const s = snap(h);
    expect(s).toMatchObject({
      version: 1,
      screen: "title",
      mode: "solo",
      menuIndex: 0,
      titleIndex: 0,
      resumeScreen: "playing",
      score: { p1: 0, p2: 0 },
      winner: null,
      receiver: "left",
      muted: false,
      ai: { tracking: true, movement: true },
      simTime: 0,
    });
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      drivenVy: 0,
      driven: false,
    });
    expect(s.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      speed: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect([1, -1]).toContain(s.ball?.serveSign);
    expect(s.obstacles).toEqual([
      { index: 0, cx: 490, cy: 220 },
      { index: 1, cx: 790, cy: 500 },
    ]);
    expect(BACKGROUND).toMatch(/^#/);
  });

  it("registers its actions in the layout's order", async () => {
    const h = await createHarness();
    // Every bound key drives the action it names: W moves the menu up.
    expect(ACTIONS).toHaveLength(8);
    h.tap("KeyS");
    await h.advance(1);
    expect(snap(h).menuIndex).toBe(1);
    h.tap("KeyW");
    await h.advance(1);
    expect(snap(h).menuIndex).toBe(0);
  });

  it("accumulates simTime on every screen", async () => {
    const h = await createHarness();
    await h.advance(30);
    expect(snap(h).simTime).toBeCloseTo(0.5);
  });
});

describe("title menu", () => {
  it("wraps both ways", async () => {
    const h = await createHarness();
    h.tap("ArrowUp");
    await h.advance(1);
    expect(snap(h).menuIndex).toBe(2);
    h.tap("ArrowDown");
    await h.advance(1);
    expect(snap(h).menuIndex).toBe(0);
  });

  it("applies up before down and movement before confirm", async () => {
    const h = await createHarness();
    h.tap("ArrowDown");
    h.tap("KeyW");
    await h.advance(1);
    expect(snap(h).menuIndex).toBe(2);
    h.tap("ArrowDown");
    h.tap("Enter");
    await h.advance(1);
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 0 });
  });

  it("starts a Solo match on SOLO", async () => {
    const h = await createHarness();
    h.tap("Enter");
    await h.advance(1);
    const s = snap(h);
    expect(s).toMatchObject({
      screen: "countdown",
      mode: "solo",
      resumeScreen: "playing",
      menuIndex: 0,
      titleIndex: 0,
      receiver: "left",
    });
    expect(s.ball?.held).toBe(true);
    // The countdown advanced on the frame it was reached.
    expect(s.ball?.holdTimer).toBeCloseTo(HOLD_TIME - DT);
  });

  it("starts a Versus match on VERSUS and remembers the choice", async () => {
    const h = await createHarness();
    h.tap("ArrowDown");
    await h.advance(1);
    h.tap("Space");
    await h.advance(1);
    expect(snap(h)).toMatchObject({
      screen: "countdown",
      mode: "versus",
      titleIndex: 1,
    });
    h.tap("KeyP");
    await h.advance(1);
    h.pose((d, s) => d.setMenuIndex(s, 2));
    h.tap("Enter");
    await h.advance(1);
    expect(snap(h)).toMatchObject({
      screen: "title",
      menuIndex: 1,
      titleIndex: 1,
    });
  });

  it("opens and leaves the how-to screen", async () => {
    const h = await createHarness();
    h.pose((d, s) => d.setMenuIndex(s, 2));
    h.tap("Enter");
    await h.advance(1);
    expect(snap(h)).toMatchObject({
      screen: "howto",
      menuIndex: 0,
      titleIndex: 2,
    });
    h.tap("Escape");
    await h.advance(1);
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 2 });

    h.tap("Enter");
    await h.advance(1);
    h.tap("Enter");
    await h.advance(1);
    expect(snap(h).screen).toBe("title");
  });

  it("confirms nothing for a highlight that names no item", async () => {
    const h = await createHarness();
    for (const screen of ["title", "paused", "matchover"] as const) {
      h.pose((d, s) => d.setScreen(s, screen));
      h.pose((d, s) => d.setMenuIndex(s, 7));
      h.tap("Enter");
      await h.advance(1);
      expect(snap(h)).toMatchObject({ screen, menuIndex: 7 });
    }
  });

  it("ignores back on the title", async () => {
    const h = await createHarness();
    h.tap("Escape");
    await h.advance(1);
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 0 });
  });
});

describe("pointer and touch", () => {
  async function onTitle(): Promise<Harness> {
    return createHarness();
  }

  function centerOf(h: Harness, index: number): { x: number; y: number } {
    const rect = h.debug.menuItemRect(h.engine.state, index);
    if (rect === null) throw new Error("no rect");
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  }

  it("selects the item a pointer moves onto", async () => {
    const h = await onTitle();
    const c = centerOf(h, 2);
    h.pointer("pointermove", c.x, c.y);
    await h.advance(1);
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 2 });
  });

  it("confirms a click whose press and release share one item", async () => {
    const h = await onTitle();
    const c = centerOf(h, 1);
    h.pointer("pointerdown", c.x, c.y);
    await h.advance(1);
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 1 });
    h.pointer("pointerup", c.x, c.y);
    await h.advance(1);
    expect(snap(h)).toMatchObject({
      screen: "countdown",
      mode: "versus",
      titleIndex: 1,
    });
  });

  it("confirms a press and release that arrive on one frame", async () => {
    const h = await onTitle();
    const c = centerOf(h, 2);
    h.pointer("pointerdown", c.x, c.y);
    h.pointer("pointerup", c.x, c.y);
    await h.advance(1);
    expect(snap(h)).toMatchObject({ screen: "howto", titleIndex: 2 });
  });

  it("confirms nothing when the edges fall in different regions", async () => {
    const h = await onTitle();
    const a = centerOf(h, 0);
    const b = centerOf(h, 1);
    h.pointer("pointerdown", a.x, a.y);
    await h.advance(1);
    h.pointer("pointermove", b.x, b.y);
    await h.advance(1);
    h.pointer("pointerup", b.x, b.y);
    await h.advance(1);
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 1 });

    h.pointer("pointerdown", 20, 20);
    h.pointer("pointermove", b.x, b.y);
    h.pointer("pointerup", b.x, b.y);
    await h.advance(1);
    expect(snap(h).screen).toBe("title");
  });

  it("takes touch the same way", async () => {
    const h = await onTitle();
    const c = centerOf(h, 2);
    h.pointer("pointerdown", c.x, c.y, { device: "touch" });
    await h.advance(1);
    expect(snap(h).menuIndex).toBe(2);
    h.pointer("pointerup", c.x, c.y, { device: "touch" });
    await h.advance(1);
    expect(snap(h).screen).toBe("howto");
  });

  it("lets the pointer win over a keyboard move, and the keyboard win a confirm", async () => {
    const h = await onTitle();
    const c = centerOf(h, 2);
    h.tap("ArrowDown");
    h.pointer("pointermove", c.x, c.y);
    await h.advance(1);
    expect(snap(h).menuIndex).toBe(2);

    const solo = centerOf(h, 0);
    h.pose((d, s) => d.setMenuIndex(s, 1));
    h.tap("Enter");
    h.pointer("pointerdown", solo.x, solo.y);
    h.pointer("pointerup", solo.x, solo.y);
    await h.advance(1);
    expect(snap(h)).toMatchObject({ screen: "countdown", mode: "versus" });
  });

  it("drives the pause and match-over menus", async () => {
    const h = await inMatch("solo");
    h.tap("Escape");
    await h.advance(1);
    const quit = centerOf(h, 2);
    h.pointer("pointerdown", quit.x, quit.y);
    h.pointer("pointerup", quit.x, quit.y);
    await h.advance(1);
    expect(snap(h).screen).toBe("title");

    h.pose((d, s) => d.setScreen(s, "matchover"));
    const again = centerOf(h, 0);
    h.pointer("pointerdown", again.x, again.y);
    h.pointer("pointerup", again.x, again.y);
    await h.advance(1);
    expect(snap(h).screen).toBe("countdown");
  });
});

describe("countdown and serve", () => {
  it("serves toward the receiver once the hold elapses", async () => {
    const h = await inMatch("solo");
    h.pose((d, s) => d.setBallServeSign(s, -1));
    await h.advance(59);
    expect(snap(h).screen).toBe("countdown");
    expect(snap(h).ball?.trail.length).toBeGreaterThan(0);
    await h.advance(1);
    const s = snap(h);
    expect(s.screen).toBe("playing");
    expect(s.ball).toMatchObject({
      held: false,
      holdTimer: 0,
      x: FIELD_CX,
      y: FIELD_CY,
      trail: [],
      serveSign: -1,
    });
    expect(s.ball?.vx).toBeCloseTo(-SERVE_SPEED * Math.cos(SERVE_ANGLE));
    expect(s.ball?.vy).toBeCloseTo(-SERVE_SPEED * Math.sin(SERVE_ANGLE));
  });

  it("serves on the next frame after the hold timer is posed to zero", async () => {
    const h = await inMatch("versus");
    h.pose((d, s) => d.setReceiver(s, "right"));
    h.pose((d, s) => d.setBallServeSign(s, 1));
    h.pose((d, s) => d.setBallHoldTimer(s, 0));
    await h.advance(1);
    const s = snap(h);
    expect(s.screen).toBe("playing");
    expect(s.ball?.vx).toBeGreaterThan(0);
    expect(s.ball?.vy).toBeGreaterThan(0);
  });

  it("moves the paddles during the countdown", async () => {
    const h = await inMatch("versus");
    h.keyDown("KeyS");
    h.keyDown("ArrowUp");
    await h.advance(6);
    const s = snap(h);
    expect(s.paddles.left.cy).toBeCloseTo(FIELD_CY + PADDLE_SPEED * DT * 6);
    expect(s.paddles.right.cy).toBeCloseTo(FIELD_CY - PADDLE_SPEED * DT * 6);
    expect(s.paddles.left.vy).toBe(PADDLE_SPEED);
  });

  it("lets either set of keys move the paddle in Solo", async () => {
    const h = await inMatch("solo");
    h.keyDown("ArrowDown");
    await h.advance(3);
    expect(snap(h).paddles.left.vy).toBe(PADDLE_SPEED);
    h.keyUp("ArrowDown");
    h.keyDown("KeyW");
    await h.advance(1);
    expect(snap(h).paddles.left.vy).toBe(-PADDLE_SPEED);
  });

  it("draws serve signs both ways over many parkings", async () => {
    const h = await createHarness();
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      h.pose((d, s) => d.spawnBall(s));
      seen.add(snap(h).ball?.serveSign ?? 0);
    }
    expect(seen).toEqual(new Set([1, -1]));
  });
});

describe("live play", () => {
  async function rally(h: Harness): Promise<void> {
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setBallHeld(s, false));
  }

  it("records a trail of the last TRAIL_TIME seconds", async () => {
    const h = await inMatch("solo");
    await rally(h);
    h.pose((d, s) => d.setBallVelocity(s, 300, 0));
    await h.advance(30);
    const trail = snap(h).ball?.trail ?? [];
    const t = snap(h).simTime;
    expect(trail.length).toBeGreaterThan(3);
    expect(trail.every((p) => t - p.t <= TRAIL_TIME + 1e-9)).toBe(true);
    expect(trail[trail.length - 1].x).toBeCloseTo(snap(h).ball?.x ?? 0);
  });

  it("scores for player one past the right edge and serves back to the right", async () => {
    const h = await inMatch("solo");
    await rally(h);
    h.pose((d, s) => d.setBallPosition(s, FIELD_W + BALL_R - 1, 100));
    h.pose((d, s) => d.setBallVelocity(s, 300, 0));
    await h.advance(1);
    const s = snap(h);
    expect(s.score).toEqual({ p1: 1, p2: 0 });
    expect(s.screen).toBe("countdown");
    expect(s.receiver).toBe("right");
    expect(s.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect(h.cues).toContain(CUES.score);
  });

  it("scores for player two past the left edge", async () => {
    const h = await inMatch("solo");
    await rally(h);
    h.pose((d, s) => d.setPaddleCy(s, "left", 600));
    h.pose((d, s) => d.setBallPosition(s, 10, 100));
    h.pose((d, s) => d.setBallVelocity(s, -900, 0));
    await h.advance(2);
    expect(snap(h).score).toEqual({ p1: 0, p2: 1 });
    expect(snap(h).receiver).toBe("left");
  });

  it("ends the match at eleven with a two-point lead", async () => {
    const h = await inMatch("versus");
    await rally(h);
    h.pose((d, s) => d.setScore(s, 10, 9));
    h.pose((d, s) => d.setBallPosition(s, FIELD_W + BALL_R - 1, 100));
    h.pose((d, s) => d.setBallVelocity(s, 300, 0));
    await h.advance(1);
    const s = snap(h);
    expect(s).toMatchObject({
      screen: "matchover",
      winner: "left",
      menuIndex: 0,
      score: { p1: 11, p2: 9 },
    });
    expect(s.ball?.x).toBeGreaterThan(FIELD_W);
  });

  it("plays on at 10-10 until a two-point lead", async () => {
    const h = await inMatch("versus");
    await rally(h);
    h.pose((d, s) => d.setScore(s, 10, 10));
    h.pose((d, s) => d.setBallPosition(s, -BALL_R + 1, 100));
    h.pose((d, s) => d.setBallVelocity(s, -300, 0));
    await h.advance(1);
    expect(snap(h)).toMatchObject({
      screen: "countdown",
      score: { p1: 10, p2: 11 },
    });
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setBallPosition(s, -BALL_R + 1, 100));
    h.pose((d, s) => d.setBallVelocity(s, -300, 0));
    await h.advance(1);
    expect(snap(h)).toMatchObject({ screen: "matchover", winner: "right" });
  });

  it("returns a ball off a moving paddle with spin, playing each cue once", async () => {
    const h = await inMatch("versus");
    await rally(h);
    h.pose((d, s) => d.setPaddleDriven(s, "left", true));
    h.pose((d, s) => d.setPaddleVy(s, "left", 300));
    h.pose((d, s) => d.setBallPosition(s, P1_X1 + BALL_R + 4, FIELD_CY + 2));
    h.pose((d, s) => d.setBallVelocity(s, -600, 0));
    h.cues.length = 0;
    await h.advance(1);
    const s = snap(h);
    expect(s.ball?.vx).toBeGreaterThan(0);
    expect(s.ball?.spin).toBeGreaterThan(0);
    expect(s.paddles.left.vy).toBe(300);
    expect(h.cues).toEqual([CUES.paddleHit]);
  });

  it("plays the wall and obstacle cues", async () => {
    const h = await inMatch("versus");
    await rally(h);
    h.pose((d, s) => d.setBallPosition(s, 300, BALL_R + 1));
    h.pose((d, s) => d.setBallVelocity(s, 0, -400));
    h.cues.length = 0;
    await h.advance(1);
    expect(h.cues).toEqual([CUES.wallBounce]);

    h.pose((d, s) => d.setBallPosition(s, 470, 220));
    h.pose((d, s) => d.setBallVelocity(s, 400, 0));
    h.cues.length = 0;
    await h.advance(1);
    expect(h.cues).toEqual([CUES.obstacleBounce]);
  });

  it("lets the AI defend in Solo", async () => {
    const h = await inMatch("solo");
    await rally(h);
    h.pose((d, s) => d.setBallPosition(s, 900, 150));
    h.pose((d, s) => d.setBallVelocity(s, 400, 0));
    await h.advance(20);
    expect(snap(h).paddles.right.cy).toBeLessThan(250);
  });

  it("ignores the keys on a driven paddle", async () => {
    const h = await inMatch("versus");
    h.pose((d, s) => d.setPaddleDriven(s, "right", true));
    h.pose((d, s) => d.setPaddleVy(s, "right", -100));
    h.keyDown("ArrowDown");
    await h.advance(6);
    const right = snap(h).paddles.right;
    expect(right.vy).toBe(-100);
    expect(right.drivenVy).toBe(-100);
    expect(right.cy).toBeCloseTo(FIELD_CY - 10);
  });

  it("pins a driven paddle at its bound with zero velocity", async () => {
    const h = await inMatch("versus");
    h.pose((d, s) => d.setPaddleDriven(s, "left", true));
    h.pose((d, s) => d.setPaddleVy(s, "left", -2000));
    await h.advance(30);
    expect(snap(h).paddles.left).toMatchObject({
      cy: PADDLE_MIN_CY,
      vy: 0,
      drivenVy: -2000,
    });
  });

  it("takes no part in a frame without a ball", async () => {
    const h = await inMatch("solo");
    await rally(h);
    h.pose((d, s) => d.clearWorld(s));
    await h.advance(10);
    expect(snap(h)).toMatchObject({ ball: null, obstacles: [] });
    h.pose((d, s) => d.setScreen(s, "countdown"));
    await h.advance(10);
    expect(snap(h).ball).toBeNull();
  });
});

describe("pause", () => {
  it("opens and holds on one Escape, and resumes on the next", async () => {
    const h = await inMatch("solo");
    h.tap("Escape");
    await h.advance(1);
    expect(snap(h)).toMatchObject({
      screen: "paused",
      resumeScreen: "countdown",
      menuIndex: 0,
    });
    const frozen = snap(h).ball?.holdTimer;
    await h.advance(30);
    expect(snap(h).screen).toBe("paused");
    expect(snap(h).ball?.holdTimer).toBe(frozen);
    h.tap("Escape");
    await h.advance(1);
    expect(snap(h).screen).toBe("countdown");
  });

  it("walks the pause menu and restarts in the current mode", async () => {
    const h = await inMatch("versus");
    h.pose((d, s) => d.setScore(s, 4, 3));
    h.tap("KeyP");
    await h.advance(1);
    h.tap("ArrowUp");
    await h.advance(1);
    expect(snap(h).menuIndex).toBe(2);
    h.tap("KeyW");
    await h.advance(1);
    h.tap("Enter");
    await h.advance(1);
    expect(snap(h)).toMatchObject({
      screen: "countdown",
      mode: "versus",
      score: { p1: 0, p2: 0 },
    });
  });

  it("resumes from RESUME, and pause or back resume without moving the menu", async () => {
    const h = await inMatch("solo");
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.tap("KeyP");
    await h.advance(1);
    expect(snap(h).resumeScreen).toBe("playing");
    h.tap("Enter");
    await h.advance(1);
    expect(snap(h).screen).toBe("playing");

    h.tap("KeyP");
    await h.advance(1);
    h.tap("KeyP");
    h.tap("ArrowDown");
    await h.advance(1);
    expect(snap(h)).toMatchObject({ screen: "playing", menuIndex: 0 });
  });
});

describe("match over", () => {
  it("walks its menu, plays again, and returns to the title", async () => {
    const h = await inMatch("versus");
    h.pose((d, s) => d.setScreen(s, "matchover"));
    h.pose((d, s) => d.setWinner(s, "right"));
    h.tap("ArrowDown");
    await h.advance(1);
    expect(snap(h).menuIndex).toBe(1);
    h.tap("ArrowDown");
    await h.advance(1);
    expect(snap(h).menuIndex).toBe(0);
    h.tap("Enter");
    await h.advance(1);
    expect(snap(h)).toMatchObject({
      screen: "countdown",
      mode: "versus",
      winner: null,
    });

    h.pose((d, s) => d.setScreen(s, "matchover"));
    h.tap("Escape");
    await h.advance(1);
    expect(snap(h).screen).toBe("title");

    h.pose((d, s) => d.setScreen(s, "matchover"));
    h.pose((d, s) => d.setMenuIndex(s, 1));
    h.tap("Enter");
    await h.advance(1);
    expect(snap(h).screen).toBe("title");
  });

  it("restores the title values but keeps titleIndex, simTime, and muted", async () => {
    const h = await createHarness();
    h.pose((d, s) => d.setTitleIndex(s, 1));
    h.pose((d, s) => d.setScreen(s, "matchover"));
    h.pose((d, s) => d.setPaddleDriven(s, "left", true));
    h.pose((d, s) => d.setAiMovement(s, false));
    h.pose((d, s) => d.clearWorld(s));
    h.tap("KeyM");
    await h.advance(5);
    h.tap("Escape");
    await h.advance(1);
    const s = snap(h);
    expect(s).toMatchObject({
      screen: "title",
      titleIndex: 1,
      menuIndex: 1,
      muted: true,
      ai: { tracking: true, movement: true },
    });
    expect(s.simTime).toBeCloseTo(6 * DT);
    expect(s.paddles.left.driven).toBe(false);
    expect(s.obstacles).toHaveLength(2);
    expect(s.ball?.held).toBe(true);
  });
});

describe("audio", () => {
  it("toggles the runtime's mute bit from any screen and mirrors it", async () => {
    const h = await createHarness();
    const gains: number[] = [];
    h.engine.events.on("cue:played", (e) => gains.push(e.gain));
    h.tap("KeyM");
    await h.advance(1);
    expect(snap(h).muted).toBe(true);

    h.pose((_, s) => startMatch(s, "versus"));
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setBallPosition(s, 300, BALL_R + 1));
    h.pose((d, s) => d.setBallVelocity(s, 0, -400));
    await h.advance(1);
    expect(gains).toEqual([0]);

    h.tap("KeyM");
    await h.advance(1);
    expect(snap(h).muted).toBe(false);
  });

  it("carries a posed mute onto the bus", async () => {
    const h = await createHarness();
    h.pose((d, s) => d.setMuted(s, true));
    expect(snap(h).muted).toBe(true);
    await h.advance(1);
    expect(snap(h).muted).toBe(true);
    h.tap("KeyM");
    await h.advance(1);
    expect(snap(h).muted).toBe(false);
  });
});

describe("delta-time independence", () => {
  interface Shot {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly spin: number;
  }

  async function drive(stepMs: number, shot: Shot) {
    const h = await createHarness(new ConstantClock(stepMs));
    h.pose((_, s) => startMatch(s, "solo"));
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setBallHeld(s, false));
    h.pose((d, s) => d.setBallPosition(s, shot.x, shot.y));
    h.pose((d, s) => d.setBallVelocity(s, shot.vx, shot.vy));
    h.pose((d, s) => d.setBallSpin(s, shot.spin));
    const cues: string[] = [];
    h.engine.events.on("cue:played", (e) => cues.push(e.cue));
    const frames = Math.round(4000 / stepMs);
    let scoredAt = -1;
    let speed = 0;
    for (let i = 0; i < frames && scoredAt < 0; i++) {
      speed = snap(h).ball?.speed ?? 0;
      await h.advance(1);
      if (snap(h).score.p2 > 0) scoredAt = snap(h).simTime;
    }
    return { cues, scoredAt, speed };
  }

  const shots: Record<string, Shot> = {
    "a curving wall bank": { x: 700, y: 120, vx: -500, vy: -260, spin: 300 },
    "an obstacle bank": { x: 600, y: 500, vx: 500, vy: 0, spin: 150 },
  };

  for (const [name, shot] of Object.entries(shots)) {
    it(`plays ${name} the same under 2 ms and 16 ms frames`, async () => {
      const fine = await drive(2, shot);
      const coarse = await drive(16, shot);
      expect(fine.cues.length).toBeGreaterThan(1);
      expect(coarse.cues).toEqual(fine.cues);
      expect(fine.scoredAt).toBeGreaterThan(0);
      expect(Math.abs(coarse.speed - fine.speed)).toBeLessThan(10);
      expect(Math.abs(coarse.scoredAt - fine.scoredAt)).toBeLessThan(
        0.08 * fine.scoredAt,
      );
    });
  }
});
