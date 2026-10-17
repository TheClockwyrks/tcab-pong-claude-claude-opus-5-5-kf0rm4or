import { describe, expect, it, vi } from "vitest";
import {
  CAROM_DEBUG_VERSION,
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
} from "./constants";
import { createDebugApi } from "./debug";
import type { CaromDebugApi, CaromState } from "./game";
import { titleState } from "./state";
import { createHarness } from "./test-harness";

const debug: CaromDebugApi = createDebugApi();
const base = (): CaromState => titleState(false);

describe("the debug surface", () => {
  it("reports its version", () => {
    expect(debug.version).toBe(CAROM_DEBUG_VERSION);
    expect(debug.snapshot(base()).version).toBe(CAROM_DEBUG_VERSION);
  });

  it("leaves the state it was handed as it was", () => {
    const state = base();
    const copy = structuredClone(state);
    debug.setScore(state, 3, 4);
    debug.setBallPosition(state, 1, 2);
    debug.setPaddleCy(state, "left", 100);
    debug.clearWorld(state);
    expect(state).toEqual(copy);
  });

  it("clears and respawns the world", () => {
    const empty = debug.clearWorld(base());
    expect(debug.snapshot(empty)).toMatchObject({ ball: null, obstacles: [] });
    expect(empty.paddles).toEqual(base().paddles);

    const one = debug.spawnObstacle(empty, 1);
    const both = debug.spawnObstacle(one, 0);
    expect(both.obstacles.map((o) => o.index)).toEqual([0, 1]);
    expect(debug.spawnObstacle(both, 1).obstacles).toHaveLength(2);
    expect(() => debug.spawnObstacle(both, 2)).toThrow();
    expect(() => debug.spawnObstacle(both, 0.5)).toThrow();

    const moved = debug.setBallVelocity(debug.spawnBall(empty), 100, 0);
    const respawned = debug.spawnBall(moved);
    expect(respawned.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
  });

  it("fails loudly on a ball that is not there", () => {
    const empty = debug.clearWorld(base());
    expect(() => debug.setBallPosition(empty, 1, 2)).toThrow();
    expect(() => debug.setBallVelocity(empty, 1, 2)).toThrow();
    expect(() => debug.setBallSpin(empty, 1)).toThrow();
    expect(() => debug.setBallHeld(empty, false)).toThrow();
    expect(() => debug.setBallHoldTimer(empty, 0)).toThrow();
    expect(() => debug.setBallServeSign(empty, 1)).toThrow();
    expect(() => debug.drawBallServeSign(empty)).toThrow();
  });

  it("refuses values outside each pose's vocabulary", () => {
    const s = base();
    expect(() => debug.setScreen(s, "lobby" as never)).toThrow();
    expect(() => debug.setMode(s, "coop" as never)).toThrow();
    expect(() => debug.setResumeScreen(s, "title" as never)).toThrow();
    expect(() => debug.setWinner(s, "up" as never)).toThrow();
    expect(() => debug.setReceiver(s, "up" as never)).toThrow();
    expect(() => debug.setPaddleCy(s, "middle" as never, 3)).toThrow();
    expect(() => debug.setPaddleCy(s, "left", Number.NaN)).toThrow();
    expect(() => debug.setPaddleDriven(s, "left", 1 as never)).toThrow();
    expect(() => debug.setMenuIndex(s, 1.5)).toThrow();
    expect(() => debug.setScore(s, 1, 0.5)).toThrow();
    expect(() => debug.setBallServeSign(s, 0 as never)).toThrow();
  });

  it("sets each field alone and reads it back", () => {
    let s = base();
    s = debug.setScreen(s, "paused");
    s = debug.setMode(s, "versus");
    s = debug.setMenuIndex(s, 2);
    s = debug.setTitleIndex(s, 1);
    s = debug.setResumeScreen(s, "countdown");
    s = debug.setScore(s, 7, 5);
    s = debug.setWinner(s, "left");
    s = debug.setReceiver(s, "right");
    s = debug.setPaddleCy(s, "right", 200);
    s = debug.setPaddleVy(s, "right", 150);
    s = debug.setPaddleDriven(s, "right", true);
    s = debug.setBallPosition(s, 100, 200);
    s = debug.setBallVelocity(s, 30, 40);
    s = debug.setBallSpin(s, -250);
    s = debug.setBallHeld(s, false);
    s = debug.setBallHoldTimer(s, 0.25);
    s = debug.setBallServeSign(s, -1);
    s = debug.setAiTracking(s, false);
    s = debug.setAiMovement(s, false);
    s = debug.setMuted(s, true);
    const snap = debug.snapshot(s);
    expect(snap).toMatchObject({
      screen: "paused",
      mode: "versus",
      menuIndex: 2,
      titleIndex: 1,
      resumeScreen: "countdown",
      score: { p1: 7, p2: 5 },
      winner: "left",
      receiver: "right",
      muted: true,
      ai: { tracking: false, movement: false },
      paddles: {
        left: { cy: FIELD_CY, vy: 0, drivenVy: 0, driven: false },
        right: { cy: 200, vy: 0, drivenVy: 150, driven: true },
      },
      ball: {
        x: 100,
        y: 200,
        vx: 30,
        vy: 40,
        speed: 50,
        spin: -250,
        held: false,
        holdTimer: 0.25,
        serveSign: -1,
      },
    });
    expect(debug.setWinner(s, null).winner).toBeNull();
  });

  it("draws a serve sign without touching anything else", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.9);
    const s = debug.setBallServeSign(base(), 1);
    const drawn = debug.drawBallServeSign(s);
    expect(drawn.ball?.serveSign).toBe(-1);
    expect({ ...drawn, ball: { ...drawn.ball, serveSign: 1 } }).toEqual(s);
    random.mockRestore();
  });

  it("resets every declared field but the mute bit", () => {
    let s = titleState(true);
    s = debug.setScore(debug.setScreen(s, "playing"), 3, 3);
    s = debug.setPaddleDriven(debug.setPaddleVy(s, "left", 99), "left", true);
    s = debug.clearWorld(debug.setAiTracking(s, false));
    s = { ...s, simTime: 12 };
    const reset = debug.reset(s);
    const fresh = titleState(true);
    expect({ ...debug.snapshot(reset), ball: null }).toEqual({
      ...debug.snapshot(fresh),
      ball: null,
    });
    expect(reset.ball).toMatchObject({ x: FIELD_CX, held: true, trail: [] });
  });

  it("reconciles to an equal state", () => {
    const s = debug.setBallVelocity(base(), 3, 4);
    const r = debug.reconcile(s);
    expect(r).toEqual(s);
    expect(debug.reconcile(r)).toEqual(r);
    expect(debug.snapshot(r).ball?.speed).toBe(5);
  });

  it("reports menu item regions only where a menu shows", () => {
    const title = base();
    const first = debug.menuItemRect(title, 0);
    const second = debug.menuItemRect(title, 1);
    expect(first).not.toBeNull();
    expect(second && first && second.y > first.y).toBe(true);
    expect(debug.menuItemRect(title, 3)).toBeNull();
    expect(debug.menuItemRect(title, -1)).toBeNull();
    expect(debug.menuItemRect(debug.setScreen(title, "howto"), 0)).not.toBe(
      null,
    );
    expect(debug.menuItemRect(debug.setScreen(title, "howto"), 1)).toBeNull();
    expect(debug.menuItemRect(debug.setScreen(title, "paused"), 2)).not.toBe(
      null,
    );
    expect(debug.menuItemRect(debug.setScreen(title, "matchover"), 2)).toBe(
      null,
    );
    expect(debug.menuItemRect(debug.setScreen(title, "playing"), 0)).toBe(null);
    expect(debug.menuItemRect(debug.setScreen(title, "countdown"), 0)).toBe(
      null,
    );
  });
});

describe("diagnostics", () => {
  it("registers short, pure readings of the state", async () => {
    const h = await createHarness();
    h.pose((d, s) => d.setBallVelocity(s, 30, 40));
    const before = h.engine.state;
    const readings = Object.fromEntries(
      h.engine.diagnostics().map((r) => [r.name, r.value]),
    );
    expect(h.engine.state).toBe(before);
    expect(readings).toMatchObject({
      screen: "title",
      mode: "solo",
      score: "0 - 0",
      "ball pos": "640.0, 360.0",
      "ball vel": "30.0, 40.0",
      "ball speed": "50.0",
      "ball spin": "0.0",
      "left paddle": "cy 360.0 vy 0.0",
      "right paddle": "cy 360.0 vy 0.0",
    });

    h.pose((d, s) => d.clearWorld(s));
    const empty = Object.fromEntries(
      h.engine.diagnostics().map((r) => [r.name, r.value]),
    );
    expect(empty["ball pos"]).toBe("none");
    expect(empty["ball spin"]).toBe("none");
  });
});
