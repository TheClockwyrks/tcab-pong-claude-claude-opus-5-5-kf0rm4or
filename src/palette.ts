// Carom — the look. Every color the renderer paints with is named here.

export const PALETTE = {
  /** The field, and the letterbox bars around it. */
  background: "#070b16",
  /** A faint grid and the field's border glow. */
  grid: "rgba(120, 150, 220, 0.06)",
  border: "rgba(120, 150, 220, 0.22)",
  net: "rgba(190, 210, 255, 0.28)",
  /** Player one, the left paddle. */
  left: "#2ee6ff",
  /** Player two or the AI, the right paddle. */
  right: "#ff4f9a",
  /** The two obstacles. */
  obstacle: "#ffc23d",
  ball: "#f6f8ff",
  text: "#e8eeff",
  textDim: "rgba(220, 230, 255, 0.55)",
  /** The veil drawn over the field behind a menu. */
  veil: "rgba(4, 7, 15, 0.72)",
  /** The highlighted menu item. */
  highlight: "#2ee6ff",
  highlightText: "#06101c",
} as const;

export const FONT = "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";
