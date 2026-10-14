import {
  CAMERA_OFFSET,
  ITEM_RADIUS,
  JUMP_V,
  PLAYER_H,
  PLAYER_HALF_W,
  STALL_TICKS,
  TRAP_HALF_H,
  TRAP_HALF_W,
  WORLD_W,
  climberScore,
  platformX,
  tideSpeed,
  type ClimberSim,
  type ItemKind,
  type Platform,
  type PlatformKind,
  type SimEvent,
} from "@/lib/games/climber-engine";

// =========================================================
// PYRAMID CLIMB - canvas renderer (browser only).
//
// Draws a ClimberSim; never changes it. Everything here may use
// Math.random / Math.sin freely: it is cosmetic and is not part of
// the replayed simulation.
//
// Performance (60 fps on a phone):
//   - every card sprite, glow and the player portrait is
//     pre-rendered once into an offscreen canvas at device
//     resolution, then blitted with drawImage (no shadowBlur or
//     gradients per platform per frame);
//   - devicePixelRatio is capped at 2;
//   - particles live in a small fixed-size pool.
//
// Night Temple look: lapis night sky, the gold side of the
// Millennium pyramid in parallax, cards with glowing hieroglyphs.
//
// Readability (v3): every platform type has its own silhouette, not
// just its own colour - gold = solid, lapis on a dotted rail with a
// chevron showing which way it is sliding = moving, a card already
// split in three = crumbles, a red spiked card = floating Trap.
//
// Juice is fast and small (it fires ~1.6x a second): a 140 ms
// landing squash, a sideways dust puff, a faint trail when falling
// fast, a short toast for power-ups / every 100 m / passing a
// friend. The camera eases upward (never down) and is clamped so the
// ball can never rise under the HUD.
//
// prefers-reduced-motion: no screen shake, no squash/stretch, no
// trail, far fewer particles, no star twinkle or pulsing; toasts
// fade without moving.
// =========================================================

const PLATFORM_H = 15;

/** World units visible below the camera bottom (death line just off-screen). */
const BOTTOM_PAD = 45;

/**
 * The view is anchored at the TOP: the top edge is always this far
 * above (camera bottom - BOTTOM_PAD), so the ball (at most 330 above
 * the camera bottom) sees exactly 445 units ahead on a phone, a laptop
 * or a landscape phone - the shared Daily board stays fair. Screens
 * differ only in how much they show BELOW the ball: the play column
 * is at most 400:625 (>= 625 units tall, ~180 below the ball), so it
 * fills a phone's width; a short screen just shows less below.
 */
export const VIEW_H = 820;

/** The engine's camera bottom at tick 0 is -80 (createClimber). */
const CAMERA_START_OFFSET = 80;

const MAX_PARTICLES = 160;

/** Camera follow time constant (seconds). Short: a softer start to
 *  each rise without the ball ever drifting far up the screen. */
const CAM_SMOOTH_S = 0.06;

/** The eased camera never trails the engine camera by more than
 *  this (world units). */
const CAM_MAX_LAG = 40;

/** Screen px kept free under the safe area for the score HUD. */
const HUD_CLEAR_PX = 112;

const TRAIL_LEN = 7;

const COLORS = {
  skyTop: "#03050f",
  skyMid: "#0b1230",
  skyLow: "#18214a",
  gold: "#f2c45a",
  goldBright: "#ffd86e",
  goldDeep: "#d79b2b",
  ink: "#ece6d6",
  lapis: "#2c4590",
  /** Breaking cards: worn grey-violet stone (pink/red = danger only). */
  cracked: "#a99cc9",
  hazard: "#ff3b4e",
  hazardDeep: "#4a0710",
  spell: "#22a586",
  spellDeep: "#0d4d42",
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  /** Downward pull (world units / s^2). */
  gravity: number;
};

function wrapForScreen(
  x: number
) {
  return ((x % WORLD_W) + WORLD_W) % WORLD_W;
}

export type HeightMarker = {
  /** Height in metres (= score). */
  score: number;
  label: string;
  kind: "best" | "rival";
};

type Toast = {
  title: string;
  detail: string;
  color: string;
  age: number;
  /** Seconds the toast stays fully visible. */
  hold: number;
};

const ITEM_TOASTS: Record<
  ItemKind,
  {
    title: string;
    detail: string;
  }
> = {
  reborn: {
    title: "Monster Reborn",
    detail: "+1 life",
  },
  swords: {
    title: "Swords of Revealing Light",
    detail: "Slow motion + shield",
  },
  pot: {
    title: "Pot of Greed",
    detail: "Super jump",
  },
};

type Sprite = {
  canvas: HTMLCanvasElement;
  /** Size in world units. */
  w: number;
  h: number;
};

function makeCanvas(
  width: number,
  height: number
) {
  const canvas =
    document.createElement("canvas");

  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));

  return canvas;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Eight simple hieroglyph-like marks, drawn centred at 0,0 in a ~1 unit box. */
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  index: number
) {
  ctx.beginPath();

  switch (index % 8) {
    case 0: // eye
      ctx.moveTo(-0.5, 0);
      ctx.quadraticCurveTo(0, -0.42, 0.5, 0);
      ctx.quadraticCurveTo(0, 0.32, -0.5, 0);
      ctx.moveTo(0.1, 0);
      ctx.arc(0, 0, 0.12, 0, Math.PI * 2);
      ctx.moveTo(-0.05, 0.16);
      ctx.lineTo(-0.2, 0.45);
      break;
    case 1: // ankh
      ctx.ellipse(0, -0.25, 0.16, 0.2, 0, 0, Math.PI * 2);
      ctx.moveTo(0, -0.05);
      ctx.lineTo(0, 0.5);
      ctx.moveTo(-0.3, 0.08);
      ctx.lineTo(0.3, 0.08);
      break;
    case 2: // water
      ctx.moveTo(-0.5, 0);
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(-0.375 + i * 0.25, i % 2 === 0 ? -0.15 : 0.15);
      }
      ctx.lineTo(0.5, 0);
      break;
    case 3: // sun disk
      ctx.arc(0, 0, 0.28, 0, Math.PI * 2);
      ctx.moveTo(0.06, 0);
      ctx.arc(0, 0, 0.06, 0, Math.PI * 2);
      break;
    case 4: // feather
      ctx.moveTo(0, 0.5);
      ctx.lineTo(0, -0.45);
      ctx.quadraticCurveTo(0.32, -0.2, 0.05, 0.3);
      break;
    case 5: // reed
      ctx.moveTo(-0.15, 0.5);
      ctx.lineTo(-0.15, -0.2);
      ctx.quadraticCurveTo(-0.1, -0.5, 0.25, -0.35);
      ctx.moveTo(-0.15, 0.1);
      ctx.lineTo(0.15, -0.05);
      break;
    case 6: // pyramid
      ctx.moveTo(-0.45, 0.35);
      ctx.lineTo(0, -0.4);
      ctx.lineTo(0.45, 0.35);
      ctx.closePath();
      ctx.moveTo(-0.12, 0.35);
      ctx.lineTo(0, 0.12);
      ctx.lineTo(0.12, 0.35);
      break;
    default: // scarab
      ctx.ellipse(0, 0.05, 0.18, 0.26, 0, 0, Math.PI * 2);
      ctx.moveTo(-0.18, -0.05);
      ctx.lineTo(-0.42, -0.25);
      ctx.moveTo(0.18, -0.05);
      ctx.lineTo(0.42, -0.25);
      ctx.moveTo(-0.18, 0.2);
      ctx.lineTo(-0.4, 0.38);
      ctx.moveTo(0.18, 0.2);
      ctx.lineTo(0.4, 0.38);
      break;
  }

  ctx.stroke();
}

export type RendererOptions = {
  reducedMotion: boolean;
  markers: HeightMarker[];
};

export class ClimberRenderer {
  private ctx: CanvasRenderingContext2D;

  private cssW = 0;

  private cssH = 0;

  private dpr = 1;

  /** CSS px per world unit. */
  private scale = 1;

  private reducedMotion: boolean;

  private markers: HeightMarker[];

  /** Markers already passed this run (toast once). */
  private passed = new Set<HeightMarker>();

  private toast: Toast | null = null;

  /** Last 100 m step reached (milestone toast). */
  private milestone = 0;

  private milestoneFlash = 0;

  private stallWarned = false;

  private tideWarned = false;

  /** Eased camera bottom (render only). */
  private viewCam: number | null = null;

  private trail: { x: number; y: number }[] = [];

  private insetTop = 0;

  private sprites = new Map<string, Sprite>();

  private sky: HTMLCanvasElement | null = null;

  private stars: { x: number; y: number; r: number; tw: number }[] = [];

  private playerSprite: HTMLCanvasElement | null = null;

  private bossImage: HTMLImageElement | null = null;

  private particles: Particle[] = [];

  private squash = 0;

  private shake = 0;

  private flash = 0;

  private fontDisplay = "Georgia, serif";

  private fontBody = "system-ui, sans-serif";

  constructor(
    private canvas: HTMLCanvasElement,
    options: RendererOptions
  ) {
    const ctx =
      canvas.getContext(
        "2d",
        {
          alpha: false,
        }
      );

    if (!ctx) {
      throw new Error("Canvas 2D is not available.");
    }

    this.ctx = ctx;
    this.reducedMotion = options.reducedMotion;
    this.markers = options.markers.filter(
      (marker) => marker.score > 0
    );

    const styles =
      getComputedStyle(document.documentElement);

    const cinzel =
      styles.getPropertyValue("--font-cinzel").trim();

    const inter =
      styles.getPropertyValue("--font-inter").trim();

    if (cinzel) this.fontDisplay = `${cinzel}, Georgia, serif`;
    if (inter) this.fontBody = `${inter}, system-ui, sans-serif`;

    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() < 0.15 ? 1.4 : 0.8,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  setBossImage(
    image: HTMLImageElement | null
  ) {
    this.bossImage = image;
    this.playerSprite = null;
  }

  /** Safe-area top inset (CSS px), so the camera keeps the ball clear
   *  of the HUD. */
  setInsetTop(
    px: number
  ) {
    this.insetTop = px;
  }

  /** A run resumed from a save starts with markers below it passed. */
  primeProgress(
    sim: ClimberSim
  ) {
    const score = climberScore(sim);
    for (const marker of this.markers) {
      if (marker.score <= score) this.passed.add(marker);
    }
    this.milestone = Math.floor(score / 100);
  }

  private showToast(
    title: string,
    detail: string,
    color: string,
    hold = 1.1
  ) {
    this.toast = {
      title,
      detail,
      color,
      age: 0,
      hold,
    };
  }

  resize(
    cssW: number,
    cssH: number
  ) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = cssW;
    this.cssH = cssH;
    this.scale = cssW / WORLD_W;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.sprites.clear();
    this.playerSprite = null;
    this.sky = null;
  }

  // -------------------------------------------------------
  // Sprite cache
  // -------------------------------------------------------

  /** Pixels per world unit in the backing store. */
  private get px() {
    return this.scale * this.dpr;
  }

  private platformSprite(
    kind: PlatformKind,
    width: number,
    glyph: number
  ): Sprite {
    const w =
      Math.round(width);

    const key =
      `p:${kind}:${w}:${glyph}`;

    const cached =
      this.sprites.get(key);

    if (cached) return cached;

    const pad = 6;
    const px = this.px;
    const canvas = makeCanvas((w + pad * 2) * px, (PLATFORM_H + pad * 2) * px);
    const ctx = canvas.getContext("2d")!;

    ctx.scale(px, px);
    ctx.translate(pad, pad);

    const palette =
      kind === "crumble"
        ? { edge: COLORS.cracked, body: "#1f1a33", glow: "rgba(170,150,220,.35)", glyph: "#d9d0f2" }
        : kind === "moving"
          ? { edge: "#7c9cf0", body: "#121c46", glow: "rgba(130,160,255,.5)", glyph: "#bcd0ff" }
          : { edge: COLORS.gold, body: "#2a1d08", glow: "rgba(255,207,94,.5)", glyph: COLORS.goldBright };

    // Soft glow underneath.
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = 8;
    roundRect(ctx, 0, 0, w, PLATFORM_H, 3);
    ctx.fillStyle = palette.body;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (kind === "ground") {
      const grad = ctx.createLinearGradient(0, 0, 0, PLATFORM_H);
      grad.addColorStop(0, "#e3b45a");
      grad.addColorStop(1, "#7a5420");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, PLATFORM_H);
      ctx.strokeStyle = "rgba(40,25,5,.45)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 34) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, PLATFORM_H);
        ctx.stroke();
      }
    } else {
      // Card frame (a card lying on its side).
      const grad = ctx.createLinearGradient(0, 0, 0, PLATFORM_H);
      grad.addColorStop(0, palette.edge);
      grad.addColorStop(1, kind === "normal" ? COLORS.goldDeep : palette.body);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = grad;
      roundRect(ctx, 0.8, 0.8, w - 1.6, PLATFORM_H - 1.6, 2.5);
      ctx.stroke();

      // Art box with a glowing hieroglyph.
      ctx.fillStyle = kind === "normal" ? "rgba(242,196,90,.12)" : "rgba(255,255,255,.06)";
      roundRect(ctx, 4, 3, w - 8, PLATFORM_H - 6, 1.5);
      ctx.fill();

      ctx.save();
      ctx.translate(w / 2, PLATFORM_H / 2);
      ctx.scale(9, 9);
      ctx.lineWidth = 0.13;
      ctx.lineCap = "round";
      ctx.strokeStyle = palette.glyph;
      ctx.shadowColor = palette.glow;
      ctx.shadowBlur = 6;
      drawGlyph(ctx, glyph);
      ctx.restore();

      if (kind === "crumble") {
        ctx.strokeStyle = "rgba(225,215,250,.9)";
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(w * 0.14, PLATFORM_H);
        ctx.lineTo(w * 0.19, PLATFORM_H * 0.55);
        ctx.lineTo(w * 0.16, PLATFORM_H * 0.3);
        ctx.moveTo(w * 0.86, 0);
        ctx.lineTo(w * 0.81, PLATFORM_H * 0.45);
        ctx.stroke();

        // Already split in three, pieces slightly out of line: it
        // reads as "breaks" from its shape, not only its colour.
        const whole = makeCanvas(canvas.width, canvas.height);
        whole.getContext("2d")!.drawImage(canvas, 0, 0);

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const pieces: [number, number, number][] = [
          [0, 0.3, 0.9],
          [0.35, 0.65, -0.7],
          [0.7, 1, 1.1],
        ];

        for (const [from, to, dy] of pieces) {
          const x0 = from === 0 ? 0 : (pad + from * w) * px;
          const x1 = to === 1 ? canvas.width : (pad + to * w) * px;
          ctx.drawImage(whole, x0, 0, x1 - x0, canvas.height, x0, dy * px, x1 - x0, canvas.height);
        }

        ctx.restore();
      }
    }

    const sprite = {
      canvas,
      w: w + pad * 2,
      h: PLATFORM_H + pad * 2,
    };

    this.sprites.set(key, sprite);

    return sprite;
  }

  private cardSprite(
    key: string,
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
    w: number,
    h: number
  ): Sprite {
    const cached =
      this.sprites.get(key);

    if (cached) return cached;

    const pad = 10;
    const px = this.px;
    const canvas = makeCanvas((w + pad * 2) * px, (h + pad * 2) * px);
    const ctx = canvas.getContext("2d")!;

    ctx.scale(px, px);
    ctx.translate(pad, pad);
    draw(ctx, w, h);

    const sprite = {
      canvas,
      w: w + pad * 2,
      h: h + pad * 2,
    };

    this.sprites.set(key, sprite);

    return sprite;
  }

  private itemSprite(
    kind: ItemKind
  ) {
    const w = ITEM_RADIUS * 1.5;
    const h = ITEM_RADIUS * 2.1;

    return this.cardSprite(
      `item:${kind}`,
      (ctx) => {
        ctx.shadowColor = "rgba(60,240,190,.8)";
        ctx.shadowBlur = 10;
        roundRect(ctx, 0, 0, w, h, 2.5);
        ctx.fillStyle = COLORS.spellDeep;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = COLORS.spell;
        ctx.stroke();

        ctx.save();
        ctx.translate(w / 2, h / 2 + 1);
        ctx.strokeStyle = "#b9ffe9";
        ctx.fillStyle = "#b9ffe9";
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";

        if (kind === "reborn") {
          // ankh
          ctx.beginPath();
          ctx.ellipse(0, -4.5, 3, 3.8, 0, 0, Math.PI * 2);
          ctx.moveTo(0, -0.7);
          ctx.lineTo(0, 8);
          ctx.moveTo(-5, 1.5);
          ctx.lineTo(5, 1.5);
          ctx.stroke();
        } else if (kind === "swords") {
          for (const a of [-0.5, 0, 0.5]) {
            ctx.save();
            ctx.rotate(a);
            ctx.beginPath();
            ctx.moveTo(0, -9);
            ctx.lineTo(0, 6);
            ctx.moveTo(-2.5, 3);
            ctx.lineTo(2.5, 3);
            ctx.stroke();
            ctx.restore();
          }
        } else {
          // pot
          ctx.beginPath();
          ctx.ellipse(0, 2, 6, 6.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(-3, -7, 6, 4);
          ctx.fillStyle = COLORS.spellDeep;
          ctx.beginPath();
          ctx.arc(-2, 1, 1.1, 0, Math.PI * 2);
          ctx.arc(2, 1, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      },
      w,
      h
    );
  }

  private trapSprite() {
    const w = TRAP_HALF_W * 2;
    const h = TRAP_HALF_H * 2;

    return this.cardSprite(
      "trap",
      (ctx) => {
        // Spikes around the card: the only spiky shape in the game,
        // so "do not touch" reads even at a glance.
        ctx.fillStyle = COLORS.hazard;
        ctx.shadowColor = "rgba(255,40,60,.9)";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        const spikes = (
          x0: number,
          y0: number,
          x1: number,
          y1: number,
          nx: number,
          ny: number,
          count: number
        ) => {
          for (let i = 0; i < count; i++) {
            const a = (i + 0.2) / count;
            const b = (i + 0.8) / count;
            const m = (a + b) / 2;
            ctx.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a);
            ctx.lineTo(x0 + (x1 - x0) * m + nx * 5, y0 + (y1 - y0) * m + ny * 5);
            ctx.lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
          }
        };
        spikes(0, 0, w, 0, 0, -1, 3);
        spikes(0, h, w, h, 0, 1, 3);
        spikes(0, 0, 0, h, -1, 0, 4);
        spikes(w, 0, w, h, 1, 0, 4);
        ctx.fill();

        roundRect(ctx, 0, 0, w, h, 3);
        ctx.fillStyle = COLORS.hazardDeep;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = COLORS.hazard;
        ctx.stroke();

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(20, 20);
        ctx.lineWidth = 0.09;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#ffd0d4";
        ctx.shadowColor = "#ff2a40";
        ctx.shadowBlur = 8;
        drawGlyph(ctx, 0);
        ctx.restore();
      },
      w,
      h
    );
  }

  private getPlayerSprite() {
    if (this.playerSprite) return this.playerSprite;

    const size = PLAYER_HALF_W * 2;
    const pad = 8;
    const px = this.px;
    const canvas = makeCanvas((size + pad * 2) * px, (size + pad * 2) * px);
    const ctx = canvas.getContext("2d")!;

    ctx.scale(px, px);
    ctx.translate(pad + size / 2, pad + size / 2);

    const r = size / 2;

    ctx.shadowColor = "rgba(255,207,94,.7)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = "#16204a";
    ctx.fill();
    ctx.shadowBlur = 0;

    const image =
      this.bossImage;

    if (
      image &&
      image.complete &&
      image.naturalWidth > 0
    ) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r - 1.5, 0, Math.PI * 2);
      ctx.clip();

      // Centre-crop the card art into the circle.
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      ctx.drawImage(
        image,
        (image.naturalWidth - side) / 2,
        (image.naturalHeight - side) / 2,
        side,
        side,
        -r,
        -r,
        size,
        size
      );
      ctx.restore();
    } else {
      // Fallback: the Millennium eye.
      ctx.save();
      ctx.scale(r * 1.5, r * 1.5);
      ctx.lineWidth = 0.08;
      ctx.lineCap = "round";
      ctx.strokeStyle = COLORS.goldBright;
      drawGlyph(ctx, 0);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, r - 0.8, 0, Math.PI * 2);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = COLORS.gold;
    ctx.stroke();

    this.playerSprite = canvas;

    return canvas;
  }

  private getSky() {
    if (this.sky) return this.sky;

    const canvas = makeCanvas(this.canvas.width, this.canvas.height);
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);

    grad.addColorStop(0, COLORS.skyTop);
    grad.addColorStop(0.55, COLORS.skyMid);
    grad.addColorStop(1, COLORS.skyLow);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Moon glow, top right.
    const moon = ctx.createRadialGradient(
      canvas.width * 0.82,
      canvas.height * 0.1,
      0,
      canvas.width * 0.82,
      canvas.height * 0.1,
      canvas.width * 0.6
    );

    moon.addColorStop(0, "rgba(160,180,255,.18)");
    moon.addColorStop(1, "rgba(160,180,255,0)");
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.sky = canvas;

    return canvas;
  }

  // -------------------------------------------------------
  // Effects
  // -------------------------------------------------------

  private emit(
    x: number,
    y: number,
    count: number,
    color: string,
    speed: number,
    upward = 0
  ) {
    const n =
      this.reducedMotion
        ? Math.ceil(count / 4)
        : count;

    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) {
        this.particles.shift();
      }

      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);

      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s + upward,
        life: 0,
        max: 0.35 + Math.random() * 0.45,
        size: 1.2 + Math.random() * 2.2,
        color,
        gravity: 260,
      });
    }
  }

  /** Landing dust: a low, sideways puff from under the ball. */
  private dust(
    x: number,
    y: number,
    color: string
  ) {
    const n =
      this.reducedMotion
        ? 2
        : 6;

    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) {
        this.particles.shift();
      }

      const side = i % 2 === 0 ? -1 : 1;

      this.particles.push({
        x: x + side * (4 + Math.random() * 6),
        y: y + 1,
        vx: side * (35 + Math.random() * 55),
        vy: 12 + Math.random() * 22,
        life: 0,
        max: 0.22 + Math.random() * 0.16,
        size: 1.6 + Math.random() * 1.8,
        color,
        gravity: 40,
      });
    }
  }

  /** Feed the events of each simulation step. */
  onEvents(
    events: SimEvent[]
  ) {
    for (const event of events) {
      switch (event.type) {
        case "bounce":
          this.squash = 1;
          this.dust(
            event.x,
            event.y,
            event.kind === "crumble"
              ? "#cfc4ea"
              : event.kind === "moving"
                ? "#bcd0ff"
                : "#f1d9a0"
          );
          break;
        case "crumble":
          this.emit(event.x, event.y, 14, "#b7a9dd", 110, -40);
          break;
        case "pickup": {
          this.emit(event.x, event.y, 22, "#7dffd8", 150, 20);
          this.flash = 0.35;
          const kind = event.kind as ItemKind;
          const toast = ITEM_TOASTS[kind];
          if (toast) this.showToast(toast.title, toast.detail, "#7dffd8");
          break;
        }
        case "trap":
          this.emit(event.x, event.y, 18, "#ff4d8d", 140);
          this.shake = 1;
          this.flash = 0.6;
          break;
        case "revive":
          this.emit(event.x, event.y + 20, 36, "#ffd86e", 200, 60);
          this.shake = 0.7;
          this.flash = 1;
          this.showToast("Monster Reborn", "Saved from the fall", "#7dffd8");
          break;
        case "death":
          this.shake = 0.8;
          break;
      }
    }
  }

  // -------------------------------------------------------
  // Frame
  // -------------------------------------------------------

  /**
   * @param alpha interpolation 0..1 between the previous and the
   *              current simulation state
   * @param dt    real seconds since the last frame (effects only)
   */
  draw(
    sim: ClimberSim,
    alpha: number,
    dt: number
  ) {
    const ctx = this.ctx;
    const scale = this.scale;
    const viewH = this.cssH / scale;

    const engineCam =
      sim.prevCamBottom + (sim.camBottom - sim.prevCamBottom) * alpha;

    let playerX =
      sim.prevX + (sim.x - sim.prevX) * alpha;

    if (Math.abs(sim.x - sim.prevX) > WORLD_W / 2) {
      playerX = sim.x;
    }

    const playerY =
      sim.prevY + (sim.y - sim.prevY) * alpha;

    // Eased camera: follows the engine camera up with a short lag,
    // never moves down, never lags more than CAM_MAX_LAG, and never
    // lets the top of the ball rise into the HUD strip.
    let cam =
      this.viewCam ?? engineCam;

    if (dt > 0 && !this.reducedMotion) {
      cam += (engineCam - cam) * (1 - Math.exp(-dt / CAM_SMOOTH_S));
    } else if (dt > 0) {
      cam = engineCam;
    }

    const hudWorld =
      (this.insetTop + HUD_CLEAR_PX) / scale;

    cam = Math.max(
      cam,
      engineCam - CAM_MAX_LAG,
      playerY + PLAYER_H + hudWorld + BOTTOM_PAD - VIEW_H
    );

    if (this.viewCam !== null) {
      cam = Math.max(cam, this.viewCam);
    }

    cam = Math.min(cam, engineCam);
    this.viewCam = cam;

    // world -> CSS px. Anchored at the top (see VIEW_H).
    // At the very start a short screen would cut off the starting
    // floor: lift the view down to show it, easing back to the fair
    // anchor within the first ~100 units of climbing.
    const startLift = Math.max(
      0,
      VIEW_H - CAMERA_START_OFFSET - viewH - (cam + CAMERA_START_OFFSET)
    );
    const topWorld = cam - BOTTOM_PAD + VIEW_H - startLift;
    const bottomWorld = topWorld - viewH;
    const sy = (worldY: number) => this.cssH - (worldY - bottomWorld) * scale;

    // Decay effects (squash ~140 ms: it fires on every bounce).
    this.squash = Math.max(0, this.squash - dt * 7);
    this.shake = Math.max(0, this.shake - dt * 3.5);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.milestoneFlash = Math.max(0, this.milestoneFlash - dt * 1.6);

    if (this.toast) {
      this.toast.age += dt;
      if (this.toast.age > this.toast.hold + 0.5) this.toast = null;
    }

    this.trackProgress(sim);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.getSky(), 0, 0);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (
      this.shake > 0 &&
      !this.reducedMotion
    ) {
      const s = this.shake * this.shake * 4;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    this.drawBackdrop(cam, sim.tick);

    // Height markers, your best and your friends' heights.
    this.drawMarkers(sy, bottomWorld, topWorld);

    const visibleBottom = bottomWorld - 40;
    const visibleTop = topWorld + 40;
    const worldTime = sim.worldTime;

    // Platforms.
    for (const p of sim.platforms) {
      if (p.y < visibleBottom || p.y > visibleTop) continue;
      this.drawPlatform(p, worldTime, sim.tick, sy);
    }

    // Spell cards.
    const t = sim.tick / 60;

    for (const item of sim.items) {
      if (item.taken || item.y < visibleBottom || item.y > visibleTop) continue;
      const sprite = this.itemSprite(item.kind);
      const bob = this.reducedMotion ? 0 : Math.sin(t * 3 + item.id) * 2;
      this.blitWrapped(sprite, item.x, sy(item.y) + bob * scale, 1, 1);
    }

    // Floating Trap cards: a slow danger pulse behind each one.
    for (const trap of sim.traps) {
      if (trap.y < visibleBottom || trap.y > visibleTop) continue;
      const sprite = this.trapSprite();

      if (!trap.hit) {
        const pulse = this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 5 + trap.id);
        ctx.globalAlpha = 0.18 + 0.2 * pulse;
        ctx.fillStyle = COLORS.hazard;
        for (const offset of [0, -WORLD_W, WORLD_W]) {
          const cx = (trap.x + offset) * scale;
          if (cx < -60 || cx > this.cssW + 60) continue;
          ctx.beginPath();
          ctx.arc(cx, sy(trap.y), (TRAP_HALF_H + 10 + 3 * pulse) * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = trap.hit ? 0.3 : 1;
      this.blitWrapped(sprite, trap.x, sy(trap.y), 1, 1);
      ctx.globalAlpha = 1;
    }

    // Particles (world space).
    this.drawParticles(dt, sy);

    // Rising sand (tide or stall rule): a hot glow from below, as
    // strong as the push. Also warns just before a stall kicks in.
    const stalledFor = sim.tick - sim.lastClimbTick - (STALL_TICKS - 90);
    const push = this.sandPush(sim);
    if ((stalledFor > 0 || push > 4) && !sim.dead) {
      const k = Math.min(1, Math.max(stalledFor / 90, push / 120));
      const pulse = this.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(t * 8);
      const glowH = this.cssH * 0.22;
      const grad = ctx.createLinearGradient(0, this.cssH - glowH, 0, this.cssH);
      grad.addColorStop(0, "rgba(255,90,60,0)");
      grad.addColorStop(1, `rgba(255,90,60,${0.42 * k * pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(-10, this.cssH - glowH, this.cssW + 20, glowH + 10);
    }

    // Player.
    this.drawPlayer(sim, playerX, playerY, sy, t);

    // Below the bottom edge (short screens) but not out yet: a gold
    // marker on the edge shows where the ball is.
    if (
      !sim.dead &&
      sy(playerY + PLAYER_H) > this.cssH
    ) {
      const mx = wrapForScreen(playerX) * scale;
      ctx.fillStyle = COLORS.goldBright;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(mx, this.cssH - 3);
      ctx.lineTo(mx - 9, this.cssH - 14);
      ctx.lineTo(mx + 9, this.cssH - 14);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Slow-motion vignette.
    if (sim.slowTicks > 0) {
      const strength = Math.min(1, sim.slowTicks / 40) * 0.35;
      const grad = ctx.createRadialGradient(
        this.cssW / 2,
        this.cssH / 2,
        this.cssH * 0.25,
        this.cssW / 2,
        this.cssH / 2,
        this.cssH * 0.75
      );
      grad.addColorStop(0, "rgba(44,69,144,0)");
      grad.addColorStop(1, `rgba(44,69,144,${strength})`);
      ctx.fillStyle = grad;
      ctx.fillRect(-10, -10, this.cssW + 20, this.cssH + 20);
    }

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,216,110,${this.flash * 0.18})`;
      ctx.fillRect(-10, -10, this.cssW + 20, this.cssH + 20);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawBackdrop(
    cam: number,
    tick: number
  ) {
    const ctx = this.ctx;
    const w = this.cssW;
    const h = this.cssH;
    const scale = this.scale;

    // Stars: slow parallax, wrap vertically.
    const starShift = (cam * 0.05 * scale) % h;

    for (const star of this.stars) {
      const y = (star.y * h + starShift) % h;
      const twinkle = this.reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(tick * 0.03 + star.tw);
      ctx.globalAlpha = 0.25 + 0.6 * twinkle;
      ctx.fillStyle = "#dfe6ff";
      ctx.fillRect(star.x * w, y, star.r, star.r);
    }

    ctx.globalAlpha = 1;

    // The Millennium pyramid side: a huge gold face in parallax.
    // It narrows a little as you climb (you feel the height) but
    // never below 80% of its base, so the cards never float off the
    // tower into empty sky.
    const parallax = 0.3;
    const APEX = 9000;
    const baseY = h + cam * parallax * scale - BOTTOM_PAD * scale * 0.3;
    const faceAt = (screenY: number) => {
      const heightAbove = (baseY - screenY) / scale;
      return Math.max(0.8, 1 - heightAbove / APEX);
    };

    const topY = -20;
    const bottomY = h + 20;
    const cx = w * 0.5;
    const base = w * 0.46;
    const halfBottom = base * faceAt(bottomY);
    const halfTop = base * faceAt(topY);

    if (halfBottom > 1) {
      // Shadow face (left) and moonlit face (right), ridge in the middle.
      const shade = ctx.createLinearGradient(0, topY, 0, bottomY);
      shade.addColorStop(0, "rgba(40,28,12,.42)");
      shade.addColorStop(1, "rgba(70,48,18,.55)");
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.moveTo(cx, topY);
      ctx.lineTo(cx - halfTop, topY);
      ctx.lineTo(cx - halfBottom, bottomY);
      ctx.lineTo(cx, bottomY);
      ctx.closePath();
      ctx.fill();

      const lit = ctx.createLinearGradient(cx, 0, cx + halfBottom, 0);
      lit.addColorStop(0, "rgba(140,98,34,.5)");
      lit.addColorStop(1, "rgba(92,64,22,.4)");
      ctx.fillStyle = lit;
      ctx.beginPath();
      ctx.moveTo(cx, topY);
      ctx.lineTo(cx + halfTop, topY);
      ctx.lineTo(cx + halfBottom, bottomY);
      ctx.lineTo(cx, bottomY);
      ctx.closePath();
      ctx.fill();

      // Stone courses.
      ctx.strokeStyle = "rgba(10,8,20,.28)";
      ctx.lineWidth = 1;
      const course = 26 * scale;
      const offset = baseY % course;

      ctx.beginPath();
      for (let y = offset; y < bottomY; y += course) {
        if (y < topY) continue;
        const half = base * faceAt(y);
        ctx.moveTo(cx - half, y);
        ctx.lineTo(cx + half, y);
      }
      ctx.stroke();

      // Gold ridge and edges catching the light.
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,216,110,.35)";
      ctx.beginPath();
      ctx.moveTo(cx, topY);
      ctx.lineTo(cx, bottomY);
      ctx.moveTo(cx + halfTop, topY);
      ctx.lineTo(cx + halfBottom, bottomY);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,216,110,.12)";
      ctx.beginPath();
      ctx.moveTo(cx - halfTop, topY);
      ctx.lineTo(cx - halfBottom, bottomY);
      ctx.stroke();

    }
  }

  /** How far the rising sand has pushed the camera above where your
   *  own climb would put it (0 when it isn't pushing). */
  private sandPush(
    sim: ClimberSim
  ) {
    const stalled = sim.tick - sim.lastClimbTick > STALL_TICKS;

    if (!stalled && tideSpeed(sim) <= 0) {
      return 0;
    }

    return Math.max(0, sim.camBottom - (sim.maxY - CAMERA_OFFSET));
  }

  /** Milestones, passing a friend's height, the stall warning. */
  private trackProgress(
    sim: ClimberSim
  ) {
    const score = climberScore(sim);

    const step = Math.floor(score / 100);

    if (step > this.milestone) {
      this.milestone = step;
      this.milestoneFlash = 1;

      if (!this.toast || this.toast.age > this.toast.hold) {
        this.showToast(`${(step * 100).toLocaleString("en-US")} m`, "", COLORS.goldBright, 0.6);
      }
    }

    for (const marker of this.markers) {
      if (
        this.passed.has(marker) ||
        score <= marker.score
      ) {
        continue;
      }

      this.passed.add(marker);

      if (marker.kind === "best") {
        this.showToast("New best!", `Past your ${marker.score.toLocaleString("en-US")} m`, COLORS.goldBright, 1.3);
      } else {
        this.showToast(`Passed ${marker.label}`, `${marker.score.toLocaleString("en-US")} m`, "#9fd0ff", 1.3);
      }
    }

    const stalled = sim.tick - sim.lastClimbTick;

    if (
      !this.tideWarned &&
      !sim.dead &&
      this.sandPush(sim) > 30
    ) {
      this.tideWarned = true;
      this.showToast("The sand is rising", "Keep moving up", "#ff9a7a", 1.6);
    }

    if (
      stalled > STALL_TICKS - 60 &&
      !this.stallWarned &&
      !sim.dead
    ) {
      this.stallWarned = true;
      this.showToast("Keep climbing!", "The floor is rising", "#ff9a7a", 1.4);
    } else if (stalled < 10) {
      this.stallWarned = false;
    }
  }

  private drawMarkers(
    sy: (y: number) => number,
    bottomWorld: number,
    topWorld: number
  ) {
    const ctx = this.ctx;
    const step = 1000; // world units = 100 m
    const labelTop = this.insetTop + HUD_CLEAR_PX;

    ctx.font = `600 10px ${this.fontBody}`;
    ctx.textBaseline = "bottom";

    const first = Math.ceil(bottomWorld / step) * step;

    for (let y = first; y < topWorld; y += step) {
      if (y <= 0) continue;
      const screenY = sy(y);

      // The 100 m line you just reached glows for a moment.
      if (
        this.milestoneFlash > 0 &&
        y === this.milestone * step
      ) {
        ctx.fillStyle = `rgba(255,216,110,${0.55 * this.milestoneFlash})`;
        ctx.fillRect(0, screenY - 0.5, this.cssW, 2);
      }

      // Keep the marker out from under the score in the top-left HUD.
      if (screenY < labelTop) continue;
      ctx.fillStyle = "rgba(242,196,90,.32)";
      ctx.fillRect(0, screenY, 14, 1);
      ctx.fillRect(this.cssW - 14, screenY, 14, 1);
      ctx.fillStyle = "rgba(242,196,90,.55)";
      ctx.fillText(`${y / 10} m`, 4, screenY - 2);
    }

    // Your best (gold, label right) and friends (blue, label left).
    for (const marker of this.markers) {
      const markerY = marker.score * 10;
      if (markerY < bottomWorld || markerY > topWorld) continue;
      const screenY = sy(markerY);
      const best = marker.kind === "best";
      const passed = this.passed.has(marker);

      // Fade the line out as it slides up under the HUD.
      const fade = Math.min(1, Math.max(0, (screenY - labelTop + 30) / 40));
      if (fade <= 0) continue;

      ctx.globalAlpha = (passed ? 0.45 : 1) * fade;
      ctx.strokeStyle = best ? "rgba(255,216,110,.6)" : "rgba(150,200,255,.55)";
      ctx.setLineDash(best ? [6, 6] : [2, 5]);
      ctx.lineWidth = best ? 1 : 1.5;
      ctx.beginPath();
      ctx.moveTo(0, screenY);
      ctx.lineTo(this.cssW, screenY);
      ctx.stroke();
      ctx.setLineDash([]);

      if (screenY >= labelTop) {
        ctx.font = `700 10px ${this.fontBody}`;
        ctx.fillStyle = best ? COLORS.goldBright : "#bfe0ff";
        ctx.textAlign = best ? "right" : "left";
        ctx.fillText(
          marker.label,
          best ? this.cssW - 6 : 22,
          screenY - 3
        );
        ctx.textAlign = "left";
        ctx.font = `600 10px ${this.fontBody}`;
      }

      ctx.globalAlpha = 1;
    }
  }

  private blitWrapped(
    sprite: Sprite,
    worldX: number,
    screenY: number,
    sx: number,
    syScale: number
  ) {
    const scale = this.scale;
    const w = sprite.w * scale * sx;
    const h = sprite.h * scale * syScale;

    for (const offset of [0, -WORLD_W, WORLD_W]) {
      const x = (worldX + offset) * scale;
      if (x + w / 2 < 0 || x - w / 2 > this.cssW) continue;
      this.ctx.drawImage(sprite.canvas, x - w / 2, screenY - h / 2, w, h);
    }
  }

  private drawPlatform(
    p: Platform,
    worldTime: number,
    tick: number,
    sy: (y: number) => number
  ) {
    const ctx = this.ctx;
    const x = platformX(p, worldTime);
    const sprite = this.platformSprite(p.kind, p.w, p.glyph);
    const centerY = sy(p.y) + (PLATFORM_H / 2) * this.scale;

    if (
      p.kind === "moving" &&
      !p.broken
    ) {
      this.drawMovingCue(p, x, worldTime, centerY);
    }

    if (!p.broken) {
      this.blitWrapped(sprite, x, centerY, 1, 1);
      return;
    }

    // Crumbled: two halves fall and fade for half a second.
    const age = (tick - p.brokenAt) / 60;
    if (age > 0.6) return;

    const fall = 0.5 * 900 * age * age * this.scale;
    const spread = 30 * age * this.scale;

    ctx.globalAlpha = Math.max(0, 1 - age / 0.6);

    for (const side of [-1, 1]) {
      const half = sprite.canvas.width / 2;
      const destW = (sprite.w * this.scale) / 2;
      const destH = sprite.h * this.scale;
      const dx = x * this.scale + (side < 0 ? -destW : 0) + side * spread;

      ctx.save();
      ctx.translate(dx + destW / 2, centerY + fall);
      if (!this.reducedMotion) ctx.rotate(side * age * 1.6);
      ctx.drawImage(
        sprite.canvas,
        side < 0 ? 0 : half,
        0,
        half,
        sprite.canvas.height,
        -destW / 2,
        -destH / 2,
        destW,
        destH
      );
      ctx.restore();
    }

    ctx.globalAlpha = 1;
  }

  /** The rail a moving card slides along + a chevron on its leading
   *  edge, so you can read where it will be when you land. */
  private drawMovingCue(
    p: Platform,
    x: number,
    worldTime: number,
    centerY: number
  ) {
    const ctx = this.ctx;
    const scale = this.scale;

    // Rail: dotted line over the whole swing.
    const left = (p.baseX - p.range - p.w / 2) * scale;
    const right = (p.baseX + p.range + p.w / 2) * scale;

    ctx.strokeStyle = "rgba(150,175,255,.34)";
    ctx.fillStyle = "rgba(150,175,255,.5)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    for (const offset of [0, -WORLD_W * scale, WORLD_W * scale]) {
      if (right + offset < 0 || left + offset > this.cssW) continue;
      ctx.moveTo(left + offset, centerY);
      ctx.lineTo(right + offset, centerY);
      // End stops.
      ctx.fillRect(left + offset, centerY - 3, 1.5, 6);
      ctx.fillRect(right + offset - 1.5, centerY - 3, 1.5, 6);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Direction: compare with a moment later (wrap-safe).
    let dir = platformX(p, worldTime + 2) - x;
    if (dir > WORLD_W / 2) dir -= WORLD_W;
    if (dir < -WORLD_W / 2) dir += WORLD_W;
    if (Math.abs(dir) < 0.01) return;
    const sign = dir > 0 ? 1 : -1;

    ctx.fillStyle = "#cfdcff";
    for (const offset of [0, -WORLD_W, WORLD_W]) {
      const edge = (x + offset + sign * (p.w / 2 + 4)) * scale;
      if (edge < -20 || edge > this.cssW + 20) continue;
      for (let i = 0; i < 2; i++) {
        const ax = edge + sign * i * 5 * scale;
        ctx.globalAlpha = i === 0 ? 0.95 : 0.5;
        ctx.beginPath();
        ctx.moveTo(ax + sign * 4 * scale, centerY);
        ctx.lineTo(ax - sign * 0.5 * scale, centerY - 4.5 * scale);
        ctx.lineTo(ax - sign * 0.5 * scale, centerY + 4.5 * scale);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
  }

  private drawParticles(
    dt: number,
    sy: (y: number) => number
  ) {
    const ctx = this.ctx;
    const scale = this.scale;
    const alive: Particle[] = [];

    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      alive.push(p);

      const k = 1 - p.life / p.max;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      const size = p.size * scale * (0.6 + 0.4 * k);
      ctx.fillRect(((p.x % WORLD_W) + WORLD_W) % WORLD_W * scale - size / 2, sy(p.y) - size / 2, size, size);
    }

    ctx.globalAlpha = 1;
    this.particles = alive;
  }

  private drawPlayer(
    sim: ClimberSim,
    x: number,
    y: number,
    sy: (y: number) => number,
    t: number
  ) {
    const ctx = this.ctx;
    const scale = this.scale;
    const sprite = this.getPlayerSprite();
    const pad = 8;
    const size = (PLAYER_HALF_W * 2 + pad * 2) * scale;

    // Squash on landing, stretch while flying fast.
    let sx = 1;
    let syScale = 1;

    if (!this.reducedMotion) {
      const stretch = Math.max(-0.12, Math.min(0.12, (sim.vy / JUMP_V) * 0.08));
      const squash = this.squash * this.squash * 0.24;
      sx = 1 + squash - stretch * 0.6;
      syScale = 1 - squash + stretch;
    }

    const feetY = sy(y);
    const centerY = feetY - (PLAYER_H / 2) * scale * syScale;

    // Speed trail: only when falling fast or boosting. Sampled by
    // distance, so it looks the same at 60 and 120 Hz.
    const fast =
      !this.reducedMotion &&
      !sim.dead &&
      (sim.vy < -JUMP_V * 0.9 || sim.vy > JUMP_V + 1);

    const last = this.trail[this.trail.length - 1];

    if (!fast) {
      this.trail.shift();
    } else if (
      !last ||
      Math.abs(last.x - x) > WORLD_W / 2
    ) {
      this.trail = [{ x, y }];
    } else if (Math.abs(last.y - y) + Math.abs(last.x - x) > 6) {
      this.trail.push({ x, y });
      if (this.trail.length > TRAIL_LEN) this.trail.shift();
    }

    if (this.trail.length > 1) {
      ctx.fillStyle = COLORS.goldBright;
      const n = this.trail.length;
      for (let i = 0; i < n - 1; i++) {
        const point = this.trail[i];
        const k = (i + 1) / n;
        ctx.globalAlpha = 0.16 * k;
        ctx.beginPath();
        ctx.arc(point.x * scale, sy(point.y) - (PLAYER_H / 2) * scale, PLAYER_HALF_W * scale * (0.45 + 0.45 * k), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Pot of Greed boost trail.
    if (sim.vy > JUMP_V + 1 && !this.reducedMotion && Math.random() < 0.8) {
      this.emit(x, y, 1, Math.random() < 0.5 ? "#ffd86e" : "#ff9a3c", 30, -80);
    }

    // Shield / invulnerability aura.
    if (sim.shieldTicks > 0 || sim.invulnTicks > 0) {
      const blink = sim.invulnTicks > 0 && sim.invulnTicks < 40 && Math.floor(t * 12) % 2 === 0;
      if (!blink) {
        ctx.beginPath();
        ctx.arc(x * scale, centerY, (PLAYER_HALF_W + 7) * scale, 0, Math.PI * 2);
        ctx.strokeStyle = sim.slowTicks > 0 ? "rgba(140,170,255,.75)" : "rgba(255,216,110,.75)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    const stunned = sim.stunTicks > 0;

    for (const offset of [0, -WORLD_W, WORLD_W]) {
      const cx = (x + offset) * scale;
      if (cx + size < 0 || cx - size > this.cssW) continue;
      ctx.save();
      ctx.translate(cx, centerY);
      if (stunned && !this.reducedMotion) ctx.rotate(Math.sin(t * 40) * 0.25);
      ctx.scale(sx, syScale);
      if (stunned) ctx.globalAlpha = 0.75;
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  /** Big score + lives + effect timers, drawn on top. */
  drawHud(
    sim: ClimberSim,
    insetTop: number
  ) {
    const ctx = this.ctx;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.insetTop = insetTop;

    const top = insetTop + 14;
    const score = climberScore(sim);

    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    // Scales down in a narrow column (landscape phone) and never runs
    // into the pause button.
    const scoreSize = Math.round(Math.max(20, Math.min(30, this.cssW * 0.08)));
    const scoreMaxW = this.cssW - 16 - 64;
    ctx.font = `800 ${scoreSize}px ${this.fontDisplay}`;
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillText(`${score.toLocaleString("en-US")}`, 17, top + 2, scoreMaxW);
    ctx.fillStyle = COLORS.goldBright;
    ctx.fillText(`${score.toLocaleString("en-US")}`, 16, top, scoreMaxW);

    ctx.font = `600 11px ${this.fontBody}`;
    ctx.fillStyle = "rgba(236,230,214,.7)";
    ctx.fillText("METRES", 17, top + scoreSize + 4);

    // Lives (Monster Reborn ankhs).
    let x = 16;
    const lifeY = top + 52;

    for (let i = 0; i < sim.lives; i++) {
      ctx.save();
      ctx.translate(x + 6, lifeY + 8);
      ctx.strokeStyle = "#7dffd8";
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.ellipse(0, -3.5, 2.6, 3.2, 0, 0, Math.PI * 2);
      ctx.moveTo(0, -0.3);
      ctx.lineTo(0, 7);
      ctx.moveTo(-4, 1.6);
      ctx.lineTo(4, 1.6);
      ctx.stroke();
      ctx.restore();
      x += 16;
    }

    // Swords of Revealing Light timer bar.
    if (sim.slowTicks > 0) {
      const barW = 90;
      const k = sim.slowTicks / 240;
      const by = lifeY + (sim.lives > 0 ? 22 : 0);
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(16, by, barW, 4);
      ctx.fillStyle = "#9db4ff";
      ctx.fillRect(16, by, barW * k, 4);
    }

    this.drawToast(insetTop);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** One short message at a time, as a slim pill inside the HUD band
   *  (the ball never goes there, and it covers almost none of the
   *  platforms ahead). Fades in fast (120 ms, ease-out), holds, fades
   *  out (300 ms). Reduced motion: fade only. */
  private drawToast(
    insetTop: number
  ) {
    const toast = this.toast;

    if (!toast) return;

    const ctx = this.ctx;
    const fadeIn = Math.min(1, toast.age / 0.12);
    const enter = 1 - (1 - fadeIn) ** 3;
    const fadeOut = Math.min(1, Math.max(0, (toast.hold + 0.5 - toast.age) / 0.3));
    const alpha = Math.min(enter, fadeOut);

    if (alpha <= 0) return;

    const rise = this.reducedMotion ? 0 : (1 - enter) * 6;
    const h = 26;
    const y = insetTop + 80 + rise;
    const maxW = this.cssW - 24;

    const titleFont = `800 13px ${this.fontDisplay}`;
    const detailFont = `600 11px ${this.fontBody}`;
    const detail = toast.detail ? `  ·  ${toast.detail}` : "";

    ctx.font = titleFont;
    const titleW = ctx.measureText(toast.title).width;
    ctx.font = detailFont;
    let detailW = detail ? ctx.measureText(detail).width : 0;

    // Too narrow for both (landscape phone): title only.
    if (titleW + detailW + 28 > maxW) detailW = 0;

    const w = Math.min(maxW, titleW + detailW + 28);
    const x = (this.cssW - w) / 2;

    ctx.globalAlpha = alpha;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = "rgba(6,9,22,.8)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = toast.color;
    ctx.globalAlpha = alpha * 0.45;
    ctx.stroke();
    ctx.globalAlpha = alpha;

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = titleFont;
    ctx.fillStyle = toast.color;
    ctx.fillText(toast.title, x + 14, y + h / 2 + 0.5, w - 28);

    if (detailW > 0) {
      ctx.font = detailFont;
      ctx.fillStyle = "rgba(236,230,214,.85)";
      ctx.fillText(detail, x + 14 + titleW, y + h / 2 + 0.5);
    }

    ctx.textBaseline = "top";
    ctx.globalAlpha = 1;
  }
}
