# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles
face each other across a dark field while a ball ricochets between them, off the
top and bottom walls, and off two fixed obstacles in the middle of the court.
Score by getting the ball past your opponent's paddle; the first to 11 points,
winning by 2, takes the match.

Its signature mechanic is **spin**: the way your paddle is moving when it strikes
the ball curves the ball's flight afterwards. Swing down through a hit to bend
the ball clockwise, swing up to bend it the other way; the curve fades by half
every 0.8 seconds. Where the ball meets the paddle sets its angle, and every
paddle hit speeds it up. The obstacles turn the court into a bank-shot puzzle.

Play **Solo** against the CPU, or **Versus** with a friend on one keyboard.

Everything is drawn in code on a canvas and every sound is synthesized: the build
ships no art or audio files, needs no backend, and fetches nothing at runtime.

## Install

Requires Node.js 20 or newer.

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Then open the URL Vite prints (by default <http://localhost:5173>).

## Production build

```sh
npm run build
```

This type-checks and writes the complete static site to `dist/`, with
`index.html` at its root. Serve that directory as-is from any static file server,
or preview it locally with `npm run preview`.

## Controls

| Action | Keys |
| --- | --- |
| Player one (left paddle) up / down | `W` / `S` |
| Player two (right paddle) up / down | `↑` / `↓` |
| Confirm a menu item | `Enter` or `Space` |
| Back (menus) | `Esc` |
| Pause / resume | `P` or `Esc` |
| Mute / unmute | `M` |
| Debug overlay | `` ` `` (backtick) |

In **Solo** you play the left paddle and either set of movement keys moves it;
the CPU plays the right. In **Versus** player one uses `W`/`S` and player two the
arrow keys. The menus also take the mouse (hover to highlight, click to choose)
and touch (tap an item). On a touchscreen the game shows a slider along each edge
for the paddles and menu buttons across the top.

## Development

| Command | Does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier, in check mode |
| `npm test` | Vitest over `src/**/*.test.ts`, with coverage |

The game lives in `src/`: `game.ts` declares the state and binds the engine's
three functions, `physics.ts` and `simulation.ts` are the render-free core,
`menus.ts` the screens' input, `debug.ts` the automation surface, and
`render.ts` the drawing. It is built on the Simple 2D engine, documented in
`engine/`.

The showcase in `showcase/` is regenerated with `node scripts/replay.mjs` (the
replay, recorded from the engine) and, after `npm run build`,
`node scripts/screenshots.mjs` (screenshots from headless Chromium).
