// Carom — everything drawn. Rendering reads the state and changes nothing: it
// is handed a read-only view and draws in the field's logical units.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_W,
  SPIN_CLAMP,
  TITLE_TEXT,
  TRAIL_TIME,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import type { BallState, CaromState, Side } from "./game";
import { menuItems, menuRect } from "./menus";
import { FONT, PALETTE } from "./palette";

type Ctx = CanvasRenderingContext2D;
type View = DeepReadonly<CaromState>;

// ---- Primitives ----------------------------------------------------------

function roundedRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function text(
  ctx: Ctx,
  copy: string,
  x: number,
  y: number,
  size: number,
  color: string,
  options: { weight?: number; align?: CanvasTextAlign; glow?: number } = {},
): void {
  ctx.save();
  ctx.font = `${options.weight ?? 700} ${size}px ${FONT}`;
  ctx.textAlign = options.align ?? "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  if (options.glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = options.glow;
  }
  ctx.fillText(copy, x, y);
  ctx.restore();
}

function glowBody(
  ctx: Ctx,
  color: string,
  blur: number,
  draw: () => void,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  draw();
  ctx.fill();
  ctx.restore();
}

// ---- The field -----------------------------------------------------------

function drawCourt(ctx: Ctx): void {
  // A faint grid, so motion reads against the dark.
  ctx.save();
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 40; x < FIELD_W; x += 80) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FIELD_H);
  }
  for (let y = 40; y < FIELD_H; y += 80) {
    ctx.moveTo(0, y);
    ctx.lineTo(FIELD_W, y);
  }
  ctx.stroke();

  // Each goal edge glows faintly in the color of the side defending it.
  const goal = (x: number, color: string, toward: number): void => {
    const gradient = ctx.createLinearGradient(x, 0, x + toward * 120, 0);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = gradient;
    ctx.fillRect(Math.min(x, x + toward * 120), 0, 120, FIELD_H);
  };
  goal(0, PALETTE.left, 1);
  goal(FIELD_W, PALETTE.right, -1);
  ctx.globalAlpha = 1;

  // The two solid walls.
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 1.5);
  ctx.lineTo(FIELD_W, 1.5);
  ctx.moveTo(0, FIELD_H - 1.5);
  ctx.lineTo(FIELD_W, FIELD_H - 1.5);
  ctx.stroke();

  // The dashed center net: decoration only.
  ctx.strokeStyle = PALETTE.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 10);
  ctx.lineTo(NET_X, FIELD_H - 10);
  ctx.stroke();
  ctx.setLineDash([]);

  // A center ring around the ball's home point.
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(FIELD_CX, FIELD_CY, 64, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawObstacles(ctx: Ctx, state: View): void {
  for (const obstacle of state.obstacles) {
    const x = obstacle.cx - OBSTACLE_W / 2;
    const y = obstacle.cy - OBSTACLE_H / 2;
    glowBody(ctx, PALETTE.obstacle, 22, () =>
      roundedRect(ctx, x, y, OBSTACLE_W, OBSTACLE_H, 8),
    );
    // A bright core stripe.
    ctx.save();
    ctx.fillStyle = "rgba(255, 250, 230, 0.55)";
    roundedRect(ctx, obstacle.cx - 2, y + 10, 4, OBSTACLE_H - 20, 2);
    ctx.fill();
    ctx.restore();
  }
}

function paddleColor(side: Side): string {
  return side === "left" ? PALETTE.left : PALETTE.right;
}

function drawPaddles(ctx: Ctx, state: View): void {
  for (const side of ["left", "right"] as const) {
    const paddle = state.paddles[side];
    const x = side === "left" ? P1_X0 : P2_X0;
    const y = paddle.cy - PADDLE_H / 2;
    const color = paddleColor(side);
    glowBody(ctx, color, 26, () =>
      roundedRect(ctx, x, y, PADDLE_W, PADDLE_H, 8),
    );
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    roundedRect(ctx, x + PADDLE_W / 2 - 2, y + 12, 4, PADDLE_H - 24, 2);
    ctx.fill();
    ctx.restore();
  }
}

/** The ball's path over the last `TRAIL_TIME` seconds, fading toward its tail. */
function drawTrail(
  ctx: Ctx,
  ball: DeepReadonly<BallState>,
  simTime: number,
): void {
  const points = ball.trail.filter((s) => simTime - s.t <= TRAIL_TIME);
  const path = [
    ...points.map(({ x, y, t }) => ({ x, y, t })),
    {
      x: ball.x,
      y: ball.y,
      t: simTime,
    },
  ];
  if (path.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = PALETTE.ball;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const age = Math.min(1, Math.max(0, (simTime - b.t) / TRAIL_TIME));
    const life = 1 - age;
    ctx.globalAlpha = 0.08 + 0.5 * life;
    ctx.lineWidth = BALL_R * 2 * (0.25 + 0.7 * life);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(ctx: Ctx, state: View): void {
  const ball = state.ball;
  if (ball === null) return;
  drawTrail(ctx, ball, state.simTime);
  glowBody(ctx, PALETTE.ball, 24, () => {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  });

  // Spin shows as an arc around the ball: its sweep is how hard the ball is
  // curving, its side which way.
  const amount = Math.min(1, Math.abs(ball.spin) / SPIN_CLAMP);
  if (amount > 0.02) {
    const heading = Math.atan2(ball.vy, ball.vx);
    const sweep = amount * Math.PI * 1.4;
    const middle = heading + (ball.spin > 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.save();
    ctx.strokeStyle = ball.spin > 0 ? PALETTE.left : PALETTE.right;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R + 6, middle - sweep / 2, middle + sweep / 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawField(ctx: Ctx, state: View): void {
  drawCourt(ctx);
  drawObstacles(ctx, state);
  drawPaddles(ctx, state);
  drawBall(ctx, state);
}

// ---- The match HUD -------------------------------------------------------

function modeLabel(state: View): string {
  return state.mode === "solo" ? "SOLO  ·  YOU vs CPU" : "VERSUS  ·  P1 vs P2";
}

function drawHud(ctx: Ctx, state: View): void {
  text(ctx, String(state.score.p1), FIELD_CX - 96, 64, 64, PALETTE.left, {
    weight: 800,
    glow: 18,
  });
  text(ctx, String(state.score.p2), FIELD_CX + 96, 64, 64, PALETTE.right, {
    weight: 800,
    glow: 18,
  });
  text(ctx, modeLabel(state), FIELD_CX, FIELD_H - 26, 16, PALETTE.textDim, {
    weight: 600,
  });
  const [leftName, rightName] =
    state.mode === "solo" ? ["YOU", "CPU"] : ["P1", "P2"];
  text(ctx, leftName, FIELD_CX - 96, 112, 14, PALETTE.textDim, {
    weight: 600,
  });
  text(ctx, rightName, FIELD_CX + 96, 112, 14, PALETTE.textDim, {
    weight: 600,
  });
  if (state.muted) {
    text(ctx, "MUTED", FIELD_W - 24, 28, 14, PALETTE.textDim, {
      align: "right",
      weight: 600,
    });
  }
}

/** The hold before a serve: a ring closing on the ball and the serve's way. */
function drawCountdown(ctx: Ctx, state: View): void {
  const ball = state.ball;
  if (ball === null) return;
  const left = Math.max(0, Math.min(1, ball.holdTimer / HOLD_TIME));
  ctx.save();
  ctx.strokeStyle = PALETTE.text;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(
    ball.x,
    ball.y,
    BALL_R + 14,
    -Math.PI / 2,
    -Math.PI / 2 + left * Math.PI * 2,
  );
  ctx.stroke();

  const dir = state.receiver === "left" ? -1 : 1;
  const tip = ball.x + dir * 70;
  ctx.fillStyle = paddleColor(state.receiver);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(tip, ball.y);
  ctx.lineTo(tip - dir * 16, ball.y - 10);
  ctx.lineTo(tip - dir * 16, ball.y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  text(ctx, "READY", FIELD_CX, FIELD_CY - 70, 22, PALETTE.text, {
    weight: 700,
    glow: 10,
  });
}

// ---- Menus ---------------------------------------------------------------

function veil(ctx: Ctx, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE.veil;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.restore();
}

function drawMenu(ctx: Ctx, state: View): void {
  const items = menuItems(state.screen);
  items.forEach((label, index) => {
    const rect = menuRect(state.screen, index);
    if (rect === null) return;
    const selected = index === state.menuIndex;
    ctx.save();
    roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 14);
    if (selected) {
      ctx.shadowColor = PALETTE.highlight;
      ctx.shadowBlur = 24;
      ctx.fillStyle = PALETTE.highlight;
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.fill();
      ctx.strokeStyle = "rgba(220, 230, 255, 0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    text(
      ctx,
      label,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2 + 1,
      24,
      selected ? PALETTE.highlightText : PALETTE.text,
      { weight: 800 },
    );
  });
}

function drawTitle(ctx: Ctx, state: View): void {
  ctx.save();
  ctx.globalAlpha = 0.35;
  drawField(ctx, state);
  ctx.restore();
  veil(ctx, 0.75);

  // A slow decorative curve sweeping behind the wordmark, to say "spin".
  const phase = (state.simTime * 0.6) % 1;
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < 24; i++) {
    const u = (i / 24 + phase) % 1;
    const x = 240 + u * 800;
    const y = 200 - Math.sin(u * Math.PI) * 90;
    ctx.globalAlpha = 0.35 * Math.sin(u * Math.PI);
    ctx.fillStyle = u < 0.5 ? PALETTE.left : PALETTE.right;
    ctx.beginPath();
    ctx.arc(x, y, 3 + 4 * Math.sin(u * Math.PI), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  text(ctx, TITLE_TEXT, FIELD_CX, 196, 132, PALETTE.text, {
    weight: 900,
    glow: 36,
  });
  text(
    ctx,
    "SPIN IT  ·  BANK IT  ·  SCORE IT",
    FIELD_CX,
    282,
    20,
    PALETTE.obstacle,
    {
      weight: 700,
    },
  );
  drawMenu(ctx, state);
  text(
    ctx,
    "W / S or ↑ / ↓ to choose   ·   ENTER to start   ·   M to mute",
    FIELD_CX,
    FIELD_H - 34,
    15,
    PALETTE.textDim,
    { weight: 500 },
  );
}

function drawHowTo(ctx: Ctx, state: View): void {
  ctx.save();
  ctx.globalAlpha = 0.25;
  drawField(ctx, state);
  ctx.restore();
  veil(ctx, 0.85);

  text(ctx, "HOW TO PLAY", FIELD_CX, 70, 48, PALETTE.text, {
    weight: 900,
    glow: 20,
  });

  const column = (
    x: number,
    y: number,
    heading: string,
    color: string,
    lines: readonly string[],
  ): void => {
    text(ctx, heading, x, y, 22, color, { weight: 800, align: "left" });
    lines.forEach((line, i) =>
      text(ctx, line, x, y + 40 + i * 30, 17, PALETTE.text, {
        weight: 500,
        align: "left",
      }),
    );
  };

  column(110, 150, "CONTROLS", PALETTE.left, [
    "Player one:  W  up,  S  down",
    "Player two:  ↑  up,  ↓  down",
    "Solo: either set moves your paddle",
    "P or Esc  pause      M  mute",
    "Enter or Space  confirm",
    "Mouse and touch work the menus",
  ]);
  column(680, 150, "SPIN", PALETTE.right, [
    "Move your paddle as you strike:",
    "the ball curves the way you swung.",
    "Swing down to bend it clockwise,",
    "swing up to bend it the other way.",
    "Spin fades by half every 0.8 s.",
    "Hit off the paddle's edge for angle.",
  ]);
  column(110, 382, "OBSTACLES", PALETTE.obstacle, [
    "Two fixed bars guard the middle.",
    "Bank shots off them change a rally",
    "in an instant, and keep their spin.",
  ]);
  column(680, 382, "WINNING", PALETTE.ball, [
    "Get the ball past the far paddle.",
    `First to ${WIN_SCORE}, winning by ${WIN_LEAD}.`,
    "Every paddle hit speeds the ball up.",
  ]);
  drawMenu(ctx, state);
}

function drawPaused(ctx: Ctx, state: View): void {
  drawField(ctx, state);
  drawHud(ctx, state);
  veil(ctx);
  text(ctx, "PAUSED", FIELD_CX, 230, 64, PALETTE.text, {
    weight: 900,
    glow: 24,
  });
  drawMenu(ctx, state);
}

function winnerCopy(state: View): string {
  if (state.mode === "solo") {
    return state.winner === "left" ? "YOU WIN" : "CPU WINS";
  }
  return state.winner === "left" ? "PLAYER ONE WINS" : "PLAYER TWO WINS";
}

function drawMatchOver(ctx: Ctx, state: View): void {
  drawField(ctx, state);
  veil(ctx);
  const color =
    state.winner === null ? PALETTE.text : paddleColor(state.winner);
  text(ctx, winnerCopy(state), FIELD_CX, 210, 64, color, {
    weight: 900,
    glow: 28,
  });
  text(
    ctx,
    `${state.score.p1}  –  ${state.score.p2}`,
    FIELD_CX,
    310,
    56,
    PALETTE.text,
    { weight: 800 },
  );
  text(ctx, modeLabel(state), FIELD_CX, 360, 16, PALETTE.textDim, {
    weight: 600,
  });
  drawMenu(ctx, state);
}

// ---- The frame -----------------------------------------------------------

export function renderFrame(state: View, ctx: Ctx): void {
  switch (state.screen) {
    case "title":
      drawTitle(ctx, state);
      break;
    case "howto":
      drawHowTo(ctx, state);
      break;
    case "countdown":
      drawField(ctx, state);
      drawHud(ctx, state);
      drawCountdown(ctx, state);
      break;
    case "playing":
      drawField(ctx, state);
      drawHud(ctx, state);
      break;
    case "paused":
      drawPaused(ctx, state);
      break;
    case "matchover":
      drawMatchOver(ctx, state);
      break;
  }
}
