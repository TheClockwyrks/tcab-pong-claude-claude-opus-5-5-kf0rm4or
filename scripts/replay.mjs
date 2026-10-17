// Records the showcase replay: a few seconds of a Solo rally, the left paddle
// steered from code through the debug surface while the AI plays the right,
// captured with the engine's recorder and stored gzipped.
// Run `node scripts/replay.mjs [out-file]`.
/* global console, process */

import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createServer } from "vite";

const OUT = process.argv[2] ?? "showcase/rally.json.gz";
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
const { createHarness } = await server.ssrLoadModule("/src/test-harness.ts");
const h = await createHarness();
const { engine, debug } = h;

// Steers the left paddle toward where the ball will meet it, swinging through
// the contact so every return carries spin.
const SWING = Number(process.env.SWING ?? 45);
const SIGN = Number(process.env.SIGN ?? -1);
const steer = (swing) => {
  const s = engine.state;
  const ball = s.ball;
  const cy = s.paddles.left.cy;
  let target = 360;
  if (ball && ball.vx < 0) {
    const t = Math.max(0, (ball.x - 75) / -ball.vx);
    target = ball.y + ball.vy * t * 0.8 + swing;
  }
  const vy = Math.max(-720, Math.min(720, (target - cy) * 9));
  engine.apply((st) => debug.setPaddleVy(st, "left", vy));
};

engine.apply((s) => debug.setPaddleDriven(s, "left", true));
h.tap("Enter"); // SOLO
await h.advance(1);
engine.apply((s) => debug.setBallServeSign(s, SIGN));
await h.advance(49);

engine.startRecording();
let swing = SWING;
for (let frame = 0; frame < 420; frame++) {
  const before = engine.state.ball?.vx ?? 0;
  steer(swing);
  await h.advance(1);
  const after = engine.state.ball?.vx ?? 0;
  if (before < 0 && after > 0) swing = -swing;
}
const recording = engine.stopRecording();
await server.close();

const gz = gzipSync(JSON.stringify(recording), { level: 9 });
writeFileSync(OUT, gz);
const snap = debug.snapshot(engine.state);
console.log(
  `${recording.frames.length} frames, ${(gz.length / 1024).toFixed(0)} KiB,`,
  `score ${snap.score.p1}-${snap.score.p2}, cues ${h.cues.join(" ")}`,
);
