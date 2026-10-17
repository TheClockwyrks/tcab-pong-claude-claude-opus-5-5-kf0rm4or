// Captures the showcase screenshots from the production build in headless
// Chromium. Run `npm run build` first, then `node scripts/screenshots.mjs`.
/* global console, process, setTimeout */

import { chromium } from "playwright";
import { preview } from "vite";

const OUT = process.argv[2] ?? "showcase";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// One key per frame or so: several edges on one frame resolve as one.
const press = async (key) => {
  await page.keyboard.press(key);
  await wait(80);
};

const server = await preview({ preview: { port: 4321, strictPort: true } });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:4321/");
await wait(800);
await page.screenshot({ path: `${OUT}/title.png` });

// How to play.
await press("ArrowDown");
await press("ArrowDown");
await press("Enter");
await wait(300);
await page.screenshot({ path: `${OUT}/howto.png` });
await press("Escape");
await wait(200);

// A Solo match: the left paddle chases the ball by keyboard until mid-rally.
await press("ArrowUp");
await press("ArrowUp");
await press("Enter");
await wait(2600);
await page.keyboard.down("KeyS");
await wait(260);
await page.keyboard.up("KeyS");
await wait(900);
await page.screenshot({ path: `${OUT}/rally.png` });

await browser.close();
await new Promise((resolve) => server.httpServer.close(resolve));
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
