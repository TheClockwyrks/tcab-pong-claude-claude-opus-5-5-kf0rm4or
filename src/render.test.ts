import { describe, expect, it } from "vitest";
import type { Recording } from "@clockwyrks/simple-2d";
import { PAUSE_ITEMS, TITLE_ITEMS, TITLE_TEXT } from "./constants";
import type { Screen } from "./game";
import { createHarness } from "./test-harness";
import type { Harness } from "./test-harness";

/** Every string a recorded frame drew with `fillText`. */
function textsOf(recording: Recording): string[] {
  const frame = recording.frames[recording.frames.length - 1];
  return frame.ops
    .map((i) => recording.ops[i])
    .filter((op) => op.op === "call" && op.method === "fillText")
    .map((op) => (op.op === "call" ? String(op.args[0]) : ""));
}

async function drawn(
  screen: Screen,
  setup: (h: Harness) => void = () => {},
): Promise<string[]> {
  const h = await createHarness();
  h.pose((d, s) => d.setScreen(s, screen));
  setup(h);
  h.engine.startRecording();
  await h.advance(1);
  return textsOf(h.engine.stopRecording());
}

describe("render", () => {
  it("draws the title and its menu", async () => {
    const texts = await drawn("title");
    expect(texts).toContain(TITLE_TEXT);
    for (const item of TITLE_ITEMS) expect(texts).toContain(item);
  });

  it("draws the how-to screen with its single item", async () => {
    const texts = await drawn("howto");
    expect(texts).toContain("HOW TO PLAY");
    expect(texts).toContain("BACK TO MENU");
    expect(texts.some((t) => t.includes("SPIN"))).toBe(true);
  });

  it("draws the scores and the mode label in play", async () => {
    const texts = await drawn("playing", (h) => {
      h.pose((d, s) => d.setScore(s, 7, 4));
      h.pose((d, s) => d.setMode(s, "versus"));
      h.pose((d, s) => d.setMuted(s, true));
      h.pose((d, s) => d.setBallSpin(s, -400));
      h.pose((d, s) => d.setBallVelocity(s, 300, 50));
    });
    expect(texts).toContain("7");
    expect(texts).toContain("4");
    expect(texts.some((t) => t.startsWith("VERSUS"))).toBe(true);
    expect(texts).toContain("MUTED");
  });

  it("draws the countdown over the field", async () => {
    const texts = await drawn("countdown", (h) => {
      h.pose((d, s) => d.setReceiver(s, "right"));
    });
    expect(texts).toContain("READY");
    expect(texts.some((t) => t.startsWith("SOLO"))).toBe(true);
  });

  it("draws the pause menu over the frozen field", async () => {
    const texts = await drawn("paused");
    expect(texts).toContain("PAUSED");
    for (const item of PAUSE_ITEMS) expect(texts).toContain(item);
  });

  it("names the winner and the final score", async () => {
    const solo = await drawn("matchover", (h) => {
      h.pose((d, s) => d.setWinner(s, "right"));
      h.pose((d, s) => d.setScore(s, 8, 11));
    });
    expect(solo).toContain("CPU WINS");
    expect(solo.some((t) => t.includes("8") && t.includes("11"))).toBe(true);

    const versus = await drawn("matchover", (h) => {
      h.pose((d, s) => d.setMode(s, "versus"));
      h.pose((d, s) => d.setWinner(s, "left"));
    });
    expect(versus).toContain("PLAYER ONE WINS");
  });

  it("draws nothing for an absent ball", async () => {
    const texts = await drawn("playing", (h) => {
      h.pose((d, s) => d.clearWorld(s));
    });
    expect(texts).not.toContain("READY");
  });
});
