/**
 * The shareable summary image, drawn with the Canvas 2D API.
 *
 * Replaces the DOM-clone approach (`html-to-image`), which rasterizes through an
 * SVG `foreignObject` and comes back empty on iOS Safari -- the black card the
 * table was handed after the first real game was the fallback `backgroundColor`
 * with nothing drawn on top of it. Nothing here can fail that way: every pixel is
 * drawn by this file, and the one async step (avatars, fonts) degrades to a card
 * that is still complete and readable.
 *
 * It also replaces the plain-text export. Hebrew text mixed with `➜` and `₪180`
 * runs reorders under WhatsApp's bidi pass, which is what put the arrows backwards
 * -- who pays whom read the wrong way round, on the one line where that matters.
 * Canvas hands each run to the platform's own text engine with an explicit
 * direction, so the layout here is the layout everyone sees.
 *
 * Money arrives already formatted by `money.ts`; no arithmetic lives in this file.
 */

/** Tokens from globals.css. Canvas cannot read a CSS variable, so they are mirrored. */
const IN = {
  page: "#0b0b0f",
  card: "#1c1c23",
  raised: "#26262f",
  feltFrom: "#1fb97a",
  feltTo: "#062a1d",
  text0: "#f5f6f7",
  text1: "#9e9eac",
  text2: "#8c8c99",
  profit: "#3ddc97",
  loss: "#ff4d6a",
  even: "#9e9eac",
  winner: "#f5d06a",
  violet: "#b9a5ff",
} as const;

const W = 1080;
const PAD = 64;
const RADIUS = 36;

export interface ShareCardPlayer {
  name: string;
  /** Pre-formatted, signed: `+₪180`. */
  net: string;
  outcome: "winner" | "loser" | "even";
  avatarSrc: string | null;
}

export interface ShareCardTransfer {
  fromName: string;
  toName: string;
  /** Pre-formatted: `₪120`. */
  amount: string;
}

export interface ShareCardData {
  title: string;
  dateLabel: string;
  /** Pre-formatted: `₪1,240`. */
  pot: string;
  playerCountLabel: string;
  winner: { name: string; net: string; avatarSrc: string | null } | null;
  players: readonly ShareCardPlayer[];
  transfers: readonly ShareCardTransfer[];
  /** The mismatch resolution line, already in Hebrew, or null. */
  note: string | null;
}

/**
 * The app's two families, resolved to the names `next/font` actually generated.
 * `ctx.font` takes a font shorthand, not a custom property, so the variable has to
 * be read off the document first -- and if the page has not loaded them yet, the
 * system stack behind them still renders correct Hebrew.
 */
function families(): { ui: string; money: string } {
  const fallback = "system-ui, sans-serif";
  if (typeof document === "undefined") return { ui: fallback, money: fallback };
  const root = getComputedStyle(document.documentElement);
  const ui = root.getPropertyValue("--font-app").trim();
  const money = root.getPropertyValue("--font-numeral").trim();
  return {
    ui: ui ? `${ui}, ${fallback}` : fallback,
    money: money ? `${money}, ${fallback}` : fallback,
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

/**
 * One text run, anchored to a physical edge.
 *
 * `direction` is set per run rather than once for the canvas: Hebrew runs are laid
 * out RTL so a name followed by a word orders correctly, and an amount run is laid
 * out LTR so `+₪180` keeps its sign in front of its digits regardless of what sits
 * beside it. Mixing the two inside one string is exactly what broke the text export.
 */
function run(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    font: string;
    color: string;
    align: "left" | "right" | "center";
    direction: "rtl" | "ltr";
    maxWidth?: number;
  },
): void {
  ctx.save();
  ctx.font = options.font;
  ctx.fillStyle = options.color;
  ctx.textAlign = options.align;
  ctx.textBaseline = "alphabetic";
  ctx.direction = options.direction;
  ctx.fillText(text, x, y, options.maxWidth);
  ctx.restore();
}

/** Truncates to fit, so a long name crowds nothing and never overlaps its amount. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number,
): string {
  ctx.save();
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.restore();
    return text;
  }
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  ctx.restore();
  return `${cut.trim()}…`;
}

/** Same-origin art, so the canvas is never tainted; a failure just yields no image. */
async function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  centerX: number,
  centerY: number,
  size: number,
): void {
  if (!image) return;
  // The characters have stub arms and legs; `contain` keeps them, a circular crop
  // would amputate them (see ChipAvatar).
  const scale = Math.min(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, centerX - width / 2, centerY - height / 2, width, height);
}

function outcomeColor(outcome: ShareCardPlayer["outcome"]): string {
  if (outcome === "winner") return IN.profit;
  if (outcome === "loser") return IN.loss;
  return IN.even;
}

/**
 * Lays the card out top to bottom and returns the canvas, sized to its content --
 * a nine-player night with six transfers is simply a taller image, never a clipped
 * one.
 */
export async function drawShareCard(data: ShareCardData): Promise<HTMLCanvasElement> {
  const { ui, money } = families();
  const [winnerImage, playerImages] = await Promise.all([
    loadImage(data.winner?.avatarSrc ?? null),
    Promise.all(data.players.map((player) => loadImage(player.avatarSrc))),
  ]);

  const rowHeight = 96;
  const transferHeight = 84;
  const feltHeight = 300;
  const winnerHeight = data.winner ? 196 : 0;

  const contentWidth = W - PAD * 2;
  const right = W - PAD;
  const left = PAD;

  let height = PAD + 64 + feltHeight + 32;
  if (data.winner) height += winnerHeight + 28;
  height += 52 + data.players.length * (rowHeight + 12);
  if (data.transfers.length > 0) {
    height += 40 + 52 + data.transfers.length * (transferHeight + 12);
  }
  if (data.note) height += 56;
  height += 110 + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  ctx.fillStyle = IN.page;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = PAD + 46;

  run(ctx, data.title, right, y, {
    font: `700 40px ${ui}`,
    color: IN.text0,
    align: "right",
    direction: "rtl",
    maxWidth: contentWidth - 220,
  });
  run(ctx, data.dateLabel, left, y, {
    font: `500 30px ${ui}`,
    color: IN.text2,
    align: "left",
    direction: "ltr",
  });
  y += 42;

  // -- The pot, on felt. --------------------------------------------------
  const felt = ctx.createLinearGradient(0, y, W, y + feltHeight);
  felt.addColorStop(0, IN.feltFrom);
  felt.addColorStop(1, IN.feltTo);
  roundRect(ctx, left, y, contentWidth, feltHeight, RADIUS + 8);
  ctx.fillStyle = felt;
  ctx.fill();

  run(ctx, "הקופה של הערב", W / 2, y + 86, {
    font: `600 32px ${ui}`,
    color: "rgba(245,246,247,0.78)",
    align: "center",
    direction: "rtl",
  });
  run(ctx, data.pot, W / 2, y + 190, {
    font: `700 104px ${money}`,
    color: IN.text0,
    align: "center",
    direction: "ltr",
  });
  run(ctx, data.playerCountLabel, W / 2, y + 244, {
    font: `500 28px ${ui}`,
    color: "rgba(245,246,247,0.72)",
    align: "center",
    direction: "rtl",
  });
  y += feltHeight + 32;

  // -- Who took the night. ------------------------------------------------
  if (data.winner) {
    roundRect(ctx, left, y, contentWidth, winnerHeight, RADIUS);
    ctx.fillStyle = IN.card;
    ctx.fill();
    ctx.strokeStyle = IN.winner;
    ctx.lineWidth = 3;
    roundRect(ctx, left + 1.5, y + 1.5, contentWidth - 3, winnerHeight - 3, RADIUS);
    ctx.stroke();

    drawAvatar(ctx, winnerImage, right - 90, y + winnerHeight / 2, 128);
    run(ctx, "בראש הערימה", right - 176, y + 72, {
      font: `600 28px ${ui}`,
      color: IN.winner,
      align: "right",
      direction: "rtl",
    });
    run(ctx, fit(ctx, data.winner.name, `700 56px ${ui}`, contentWidth - 420), right - 176, y + 132, {
      font: `700 56px ${ui}`,
      color: IN.text0,
      align: "right",
      direction: "rtl",
    });
    run(ctx, data.winner.net, left + 44, y + 122, {
      font: `700 48px ${money}`,
      color: IN.profit,
      align: "left",
      direction: "ltr",
    });
    y += winnerHeight + 28;
  }

  // -- Every result. ------------------------------------------------------
  run(ctx, "התוצאות", right, y + 32, {
    font: `600 30px ${ui}`,
    color: IN.text2,
    align: "right",
    direction: "rtl",
  });
  y += 52;

  data.players.forEach((player, index) => {
    roundRect(ctx, left, y, contentWidth, rowHeight, 28);
    ctx.fillStyle = IN.card;
    ctx.fill();

    drawAvatar(ctx, playerImages[index] ?? null, right - 58, y + rowHeight / 2, 68);
    const nameFont = `600 36px ${ui}`;
    run(ctx, fit(ctx, player.name, nameFont, contentWidth - 380), right - 110, y + 62, {
      font: nameFont,
      color: IN.text0,
      align: "right",
      direction: "rtl",
    });
    run(ctx, player.net, left + 36, y + 62, {
      font: `700 38px ${money}`,
      color: outcomeColor(player.outcome),
      align: "left",
      direction: "ltr",
    });
    y += rowHeight + 12;
  });

  // -- Who pays whom. No arrow glyph: the sentence carries the direction. --
  if (data.transfers.length > 0) {
    y += 40;
    run(ctx, "מי מעביר למי", right, y + 32, {
      font: `600 30px ${ui}`,
      color: IN.text2,
      align: "right",
      direction: "rtl",
    });
    y += 52;

    for (const transfer of data.transfers) {
      roundRect(ctx, left, y, contentWidth, transferHeight, 26);
      ctx.fillStyle = IN.raised;
      ctx.fill();

      const sentenceFont = `600 34px ${ui}`;
      const sentence = `${transfer.fromName} מעביר ל${transfer.toName}`;
      run(ctx, fit(ctx, sentence, sentenceFont, contentWidth - 300), right - 40, y + 54, {
        font: sentenceFont,
        color: IN.text0,
        align: "right",
        direction: "rtl",
      });
      run(ctx, transfer.amount, left + 36, y + 54, {
        font: `700 36px ${money}`,
        color: IN.violet,
        align: "left",
        direction: "ltr",
      });
      y += transferHeight + 12;
    }
  }

  if (data.note) {
    y += 20;
    run(ctx, data.note, right, y + 24, {
      font: `500 28px ${ui}`,
      color: IN.text1,
      align: "right",
      direction: "rtl",
      maxWidth: contentWidth,
    });
    y += 36;
  }

  // -- Footer. ------------------------------------------------------------
  const footerY = canvas.height - PAD - 14;
  run(ctx, "Tilted Poker", left, footerY, {
    font: `700 34px ${ui}`,
    color: IN.violet,
    align: "left",
    direction: "ltr",
  });
  run(ctx, "הערב נסגר באפליקציה", right, footerY, {
    font: `500 28px ${ui}`,
    color: IN.text2,
    align: "right",
    direction: "rtl",
  });

  return canvas;
}

/** PNG bytes for the share sheet. */
export async function shareCardBlob(data: ShareCardData): Promise<Blob> {
  // Webfonts have to be resolved before the first `measureText`, or the card is
  // laid out against the fallback metrics and drawn with the real ones.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }
  const canvas = await drawShareCard(data);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) throw new Error("canvas produced no image");
  return blob;
}
