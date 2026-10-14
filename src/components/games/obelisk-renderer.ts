import {
  type Block,
  type ObeliskEvent,
  type ObeliskSim,
  type Side,
} from "@/lib/games/obelisk-engine";

// =========================================================
// OBELISK RUSH - canvas renderer (render only: nothing here
// feeds back into the simulation, so Math.sin / random are fine).
//
// Night Temple scene in a portrait column:
//   - star sky, moon, distant pyramids, two temple pillars with
//     flickering torches, stone floor;
//   - the obelisk in the centre: dark granite blocks with gold
//     glyph inlays; blades stick out HORIZONTALLY (steel with a hot
//     red edge, glowing brighter when they are low = dangerous);
//     golden Ra blocks glow;
//   - your duelist (spiky-haired silhouette with a Millennium
//     pendant and a golden axe) on the left or right, swinging;
//   - a struck block flies off with stone chips, the obelisk drops
//     one block, a small shake; Ra gives "+5" and a gold burst;
//   - the accent colour (torch light, glyphs, floor glow) shifts
//     with every speed tier;
//   - prefers-reduced-motion: no shake, no chips / flying block,
//     no drop easing, no twinkle / flicker.
//
// devicePixelRatio is capped at 2.
// =========================================================

type Rgb = [number, number, number];

/** Accent per speed tier (cycles). */
const ACCENTS: Rgb[] = [
  [242, 196, 90],
  [255, 148, 62],
  [255, 92, 112],
  [182, 124, 255],
  [86, 198, 255],
  [94, 226, 162],
];

const TONE_COLOURS: Rgb[] = [
  [62, 52, 74],
  [70, 54, 64],
  [56, 52, 78],
  [66, 58, 70],
];

const GLYPH_GOLD: Rgb = [242, 196, 90];

type Flying = {
  block: Block;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  age: number;
};

type Chip = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  age: number;
  life: number;
  gold: boolean;
};

type FloatText = {
  text: string;
  x: number;
  y: number;
  age: number;
};

type Ring = {
  x: number;
  y: number;
  age: number;
  colour: Rgb;
  max: number;
};

type Star = {
  x: number;
  y: number;
  r: number;
  phase: number;
};

function mix(
  a: Rgb,
  b: Rgb,
  t: number
): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function rgb(
  c: Rgb,
  alpha = 1
) {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

function clamp01(
  v: number
) {
  return Math.max(0, Math.min(1, v));
}

function easeOut(
  t: number
) {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

// ---------------------------------------------------------
// Glyphs: local frame, x right, y down, about 20 units tall.
// ---------------------------------------------------------

type GlyphPath = (ctx: CanvasRenderingContext2D) => void;

const GLYPHS: GlyphPath[] = [
  // Wedjat eye
  (ctx) => {
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.quadraticCurveTo(0, -9, 10, 0);
    ctx.quadraticCurveTo(0, 6, -10, 0);
    ctx.moveTo(3, -0.5);
    ctx.arc(0, -0.5, 3, 0, Math.PI * 2);
    ctx.moveTo(-2, 4);
    ctx.quadraticCurveTo(-3, 9, -8, 8);
    ctx.moveTo(2, 4.4);
    ctx.lineTo(3.6, 9);
    ctx.moveTo(-10, -5);
    ctx.quadraticCurveTo(0, -12, 10, -5);
  },
  // Ankh
  (ctx) => {
    ctx.beginPath();
    ctx.ellipse(0, -5, 3.6, 4.4, 0, 0, Math.PI * 2);
    ctx.moveTo(0, -0.6);
    ctx.lineTo(0, 10);
    ctx.moveTo(-6.5, 2);
    ctx.lineTo(6.5, 2);
  },
  // Millennium Puzzle
  (ctx) => {
    ctx.beginPath();
    ctx.moveTo(-9, -7);
    ctx.lineTo(9, -7);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.moveTo(-4.5, -2.6);
    ctx.quadraticCurveTo(0, -6, 4.5, -2.6);
    ctx.quadraticCurveTo(0, 0.6, -4.5, -2.6);
  },
  // Scarab
  (ctx) => {
    ctx.beginPath();
    ctx.ellipse(0, 1, 4.5, 6, 0, 0, Math.PI * 2);
    ctx.moveTo(0, -5);
    ctx.lineTo(0, 7);
    ctx.moveTo(-4.5, -2);
    ctx.lineTo(-10, -6);
    ctx.moveTo(4.5, -2);
    ctx.lineTo(10, -6);
    ctx.moveTo(-4.5, 4);
    ctx.lineTo(-9, 8);
    ctx.moveTo(4.5, 4);
    ctx.lineTo(9, 8);
  },
  // Djed pillar
  (ctx) => {
    ctx.beginPath();
    ctx.moveTo(-3, 9);
    ctx.lineTo(-3, -3);
    ctx.moveTo(3, 9);
    ctx.lineTo(3, -3);
    for (const y of [-3, -5.5, -8]) {
      ctx.moveTo(-6, y);
      ctx.lineTo(6, y);
    }
  },
];

// Sun disk for Ra blocks.
const SUN: GlyphPath = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  for (const dir of [-1, 1]) {
    ctx.moveTo(dir * 7, -1.5);
    ctx.quadraticCurveTo(dir * 11, -6, dir * 16, -3.5);
    ctx.moveTo(dir * 7, 1.5);
    ctx.quadraticCurveTo(dir * 11, -2, dir * 16, 1);
  }
};

export class ObeliskRenderer {
  private ctx: CanvasRenderingContext2D;

  private dpr = 1;

  private width = 1;

  private height = 1;

  private reducedMotion: boolean;

  private time = 0;

  private stars: Star[] = [];

  // Layout (CSS px), computed in resize().
  private cx = 0;

  private groundY = 0;

  private bw = 100;

  private bh = 50;

  private bl = 60;

  private ph = 70;

  private playerOffset = 100;

  // Effects
  private accent: Rgb = [...ACCENTS[0]];

  private drop = 0;

  private swing = 1;

  private trail: {
    side: Side;
    age: number;
  } | null = null;

  private shake = 0;

  private flash = 0;

  private flashColour: Rgb = [255, 40, 60];

  private flying: Flying[] = [];

  private chips: Chip[] = [];

  private floats: FloatText[] = [];

  private rings: Ring[] = [];

  private deathAge = -1;

  private deathBy: "cut" | "time" = "cut";

  private hitBlade: Block | null = null;

  private vignette: CanvasGradient | null = null;

  private topShade: CanvasGradient | null = null;

  private fontBody = "system-ui, sans-serif";

  constructor(
    private canvas: HTMLCanvasElement,
    options: {
      reducedMotion: boolean;
    }
  ) {
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas 2D not available.");
    }

    this.ctx = ctx;
    this.reducedMotion = options.reducedMotion;

    for (let i = 0; i < 80; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random() * 0.7,
        r: Math.random() < 0.1 ? 1.4 : 0.4 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const display =
      getComputedStyle(document.documentElement).getPropertyValue("--font-inter").trim();

    if (display) this.fontBody = `${display}, system-ui, sans-serif`;
  }

  resize(
    width: number,
    height: number
  ) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);

    const w = this.width;
    const h = this.height;

    this.cx = w / 2;
    this.groundY = h * 0.78;
    this.bw = Math.min(w * 0.34, 150);
    this.bh = Math.min(this.bw * 0.5, h * 0.085);
    this.bl = this.bw * 0.6;
    this.ph = this.bh * 1.5;
    this.playerOffset = this.bw / 2 + this.bl * 0.66;

    this.vignette = this.ctx.createRadialGradient(
      w / 2,
      h * 0.5,
      Math.min(w, h) * 0.35,
      w / 2,
      h * 0.5,
      Math.max(w, h) * 0.75
    );
    this.vignette.addColorStop(0, "rgba(0,0,0,0)");
    this.vignette.addColorStop(1, "rgba(0,0,0,.55)");

    this.topShade = this.ctx.createLinearGradient(0, 0, 0, h * 0.2);
    this.topShade.addColorStop(0, "rgba(3,5,15,.7)");
    this.topShade.addColorStop(1, "rgba(3,5,15,0)");
  }

  /** New run: forget effects. */
  reset() {
    this.drop = 0;
    this.swing = 1;
    this.trail = null;
    this.shake = 0;
    this.flash = 0;
    this.flying = [];
    this.chips = [];
    this.floats = [];
    this.rings = [];
    this.deathAge = -1;
    this.hitBlade = null;
  }

  private playerX(
    side: Side
  ) {
    return this.cx + (side === "L" ? -1 : 1) * this.playerOffset;
  }

  onEvents(
    events: ObeliskEvent[],
    previousSide: Side
  ) {
    for (const event of events) {
      if (event.type === "strike") {
        this.swing = 0;

        if (event.side !== previousSide && !this.reducedMotion) {
          this.trail = {
            side: previousSide,
            age: 0,
          };
        }

        this.drop = this.reducedMotion
          ? 0
          : this.bh;

        const away =
          event.side === "L"
            ? 1
            : -1;

        const impactX =
          this.cx - away * (this.bw / 2);

        const impactY =
          this.groundY - this.bh * 0.5;

        if (!this.reducedMotion) {
          this.shake = Math.max(this.shake, event.ra ? 4 : 2.2);

          this.flying.push({
            block: event.block,
            x: this.cx,
            y: this.groundY - this.bh / 2,
            vx: away * (this.width * 1.6 + Math.random() * 120),
            vy: -this.height * (0.35 + Math.random() * 0.25),
            rot: 0,
            vr: away * (5 + Math.random() * 5),
            age: 0,
          });

          const count = event.ra ? 16 : 9;

          for (let i = 0; i < count; i++) {
            const gold = event.ra
              ? i % 2 === 0
              : i < 2;

            this.chips.push({
              x: impactX,
              y: impactY + (Math.random() - 0.5) * this.bh * 0.7,
              vx: away * (80 + Math.random() * 320) + (Math.random() - 0.5) * 120,
              vy: -120 - Math.random() * 360,
              size: (gold ? 1.6 : 2.4) + Math.random() * (gold ? 2 : 4),
              rot: Math.random() * Math.PI,
              vr: (Math.random() - 0.5) * 18,
              age: 0,
              life: 0.45 + Math.random() * 0.4,
              gold,
            });
          }
        }

        if (event.ra) {
          this.floats.push({
            text: "+5",
            x: this.cx,
            y: this.groundY - this.bh * 1.2,
            age: 0,
          });

          if (!this.reducedMotion) {
            this.rings.push({
              x: this.cx,
              y: this.groundY - this.bh / 2,
              age: 0,
              colour: [255, 214, 110],
              max: this.bw * 1.4,
            });
          }
        }

        if (event.tierUp && !this.reducedMotion) {
          this.rings.push({
            x: this.cx,
            y: this.groundY - this.bh * 2,
            age: 0,
            colour: ACCENTS[event.tier % ACCENTS.length],
            max: this.width * 0.8,
          });
        }
      } else if (event.type === "cut") {
        this.deathAge = 0;
        this.deathBy = "cut";
        this.hitBlade = event.block;
        this.flash = 1;
        this.flashColour = [255, 40, 60];
        this.shake = this.reducedMotion
          ? 0
          : 11;
      } else {
        this.deathAge = 0;
        this.deathBy = "time";
        this.flash = 0.8;
        this.flashColour = [255, 170, 60];
        this.shake = this.reducedMotion
          ? 0
          : 5;
      }
    }
  }

  // ---------------------------------------------------------
  // Frame
  // ---------------------------------------------------------

  draw(
    sim: ObeliskSim,
    tier: number,
    dt: number,
    paused: boolean
  ) {
    const ctx = this.ctx;
    const step = paused
      ? 0
      : dt;

    this.time += step;

    // Accent drifts to the tier colour.
    const target = ACCENTS[tier % ACCENTS.length];
    const k = this.reducedMotion
      ? 1
      : 1 - Math.exp(-step * 2.2);
    this.accent = mix(this.accent, target, k);

    // Effects
    this.drop = Math.max(0, this.drop - this.drop * Math.min(1, step * 26) - step * 40);
    this.swing = Math.min(1, this.swing + step / 0.16);
    this.shake = Math.max(0, this.shake - step * (this.shake > 4 ? 30 : 16));
    this.flash = Math.max(0, this.flash - step * 2.4);

    if (this.trail) {
      this.trail.age += step;
      if (this.trail.age > 0.1) this.trail = null;
    }

    if (this.deathAge >= 0) this.deathAge += step;

    this.stepParticles(step);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    let ox = 0;
    let oy = 0;

    if (this.shake > 0) {
      ox = (Math.random() - 0.5) * this.shake * 2;
      oy = (Math.random() - 0.5) * this.shake * 2;
    }

    ctx.save();
    ctx.translate(ox, oy);

    this.drawBackground();
    this.drawObelisk(sim);
    this.drawFlying();

    if (this.trail) {
      this.drawPlayer(this.trail.side, 0.35 * (1 - this.trail.age / 0.1), sim, true);
    }

    this.drawPlayer(sim.side, 1, sim, false);
    this.drawChips();
    this.drawRings();
    this.drawFloats();

    ctx.restore();

    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Shade under the HUD (score + timer stay readable over the stone).
    if (this.topShade) {
      ctx.fillStyle = this.topShade;
      ctx.fillRect(0, 0, this.width, this.height * 0.2);
    }

    if (this.flash > 0) {
      ctx.fillStyle = rgb(this.flashColour, 0.32 * this.flash);
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  // ---------------------------------------------------------
  // Background
  // ---------------------------------------------------------

  private drawBackground() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const gy = this.groundY;
    const accent = this.accent;

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, gy);
    sky.addColorStop(0, "#03050f");
    sky.addColorStop(0.55, "#0b1230");
    sky.addColorStop(1, rgb(mix([28, 20, 52], accent, 0.22)));
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, w + 40, gy + 20);

    // Stars
    for (const star of this.stars) {
      const twinkle = this.reducedMotion
        ? 0.75
        : 0.5 + 0.5 * Math.sin(this.time * 1.6 + star.phase);
      ctx.fillStyle = `rgba(255,244,214,${0.25 + 0.6 * twinkle})`;
      ctx.beginPath();
      ctx.arc(star.x * w, star.y * gy, star.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Moon
    const mx = w * 0.76;
    const my = h * 0.16;
    const mr = Math.max(12, w * 0.07);
    const halo = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 4.5);
    halo.addColorStop(0, "rgba(255,236,190,.22)");
    halo.addColorStop(1, "rgba(255,236,190,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(mx - mr * 4.5, my - mr * 4.5, mr * 9, mr * 9);
    ctx.fillStyle = "rgba(250,238,210,.92)";
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(11,18,48,.9)";
    ctx.beginPath();
    ctx.arc(mx + mr * 0.42, my - mr * 0.25, mr * 0.88, 0, Math.PI * 2);
    ctx.fill();

    // Distant pyramids on the horizon
    ctx.fillStyle = "rgba(16,14,40,.95)";
    this.pyramid(w * 0.2, gy, w * 0.26);
    this.pyramid(w * 0.86, gy, w * 0.2);
    ctx.fillStyle = "rgba(10,9,28,1)";
    this.pyramid(w * 0.4, gy, w * 0.14);

    // Floor
    const floor = ctx.createLinearGradient(0, gy, 0, h);
    floor.addColorStop(0, "#2a2032");
    floor.addColorStop(0.25, "#17121f");
    floor.addColorStop(1, "#06050b");
    ctx.fillStyle = floor;
    ctx.fillRect(-20, gy, w + 40, h - gy + 20);

    // Floor tile lines (perspective)
    ctx.strokeStyle = "rgba(255,230,180,.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    let y = gy;
    let gap = 6;
    while (y < h) {
      y += gap;
      gap *= 1.45;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    for (let i = -6; i <= 6; i++) {
      ctx.moveTo(this.cx + i * w * 0.06, gy);
      ctx.lineTo(this.cx + i * w * 0.32, h);
    }
    ctx.stroke();

    // Light pool under the obelisk (accent)
    const pool = ctx.createRadialGradient(this.cx, gy + 4, 4, this.cx, gy + 4, w * 0.55);
    pool.addColorStop(0, rgb(accent, 0.28));
    pool.addColorStop(1, rgb(accent, 0));
    ctx.fillStyle = pool;
    ctx.fillRect(0, gy - w * 0.3, w, w * 0.85);

    // Pillars with torches
    this.drawPillar(-w * 0.025, w * 0.115);
    this.drawPillar(w - w * 0.09, w * 0.115);
  }

  private pyramid(
    cx: number,
    baseY: number,
    half: number
  ) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(cx - half, baseY);
    ctx.lineTo(cx, baseY - half * 0.68);
    ctx.lineTo(cx + half, baseY);
    ctx.closePath();
    ctx.fill();
  }

  private drawPillar(
    x: number,
    pw: number
  ) {
    const ctx = this.ctx;
    const gy = this.groundY;
    const accent = this.accent;

    const body = ctx.createLinearGradient(x, 0, x + pw, 0);
    body.addColorStop(0, "#0c0a16");
    body.addColorStop(0.45, "#1d1828");
    body.addColorStop(1, "#0a0812");
    ctx.fillStyle = body;
    ctx.fillRect(x, 0, pw, gy + 6);

    // Flutes
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      ctx.moveTo(x + (pw * i) / 4, 0);
      ctx.lineTo(x + (pw * i) / 4, gy);
    }
    ctx.stroke();

    // Gold bands
    ctx.fillStyle = "rgba(242,196,90,.55)";
    ctx.fillRect(x, gy - 6, pw, 3);
    ctx.fillRect(x, this.height * 0.08, pw, 2);

    // Torch
    const tx = x + pw / 2;
    const ty = gy - this.height * 0.3;
    const flicker = this.reducedMotion
      ? 1
      : 0.82 + 0.12 * Math.sin(this.time * 13 + x) + 0.06 * Math.sin(this.time * 31 + x * 2);

    const glow = ctx.createRadialGradient(tx, ty - 6, 2, tx, ty - 6, this.width * 0.42);
    glow.addColorStop(0, rgb(mix([255, 170, 80], accent, 0.45), 0.34 * flicker));
    glow.addColorStop(1, rgb(accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(tx - this.width * 0.42, ty - this.width * 0.42, this.width * 0.84, this.width * 0.84);

    // Bowl
    ctx.fillStyle = "#c99a3e";
    ctx.beginPath();
    ctx.moveTo(tx - 9, ty);
    ctx.lineTo(tx + 9, ty);
    ctx.lineTo(tx + 5, ty + 7);
    ctx.lineTo(tx - 5, ty + 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(tx - 1.5, ty + 7, 3, 10);

    // Flame
    const fh = 16 * flicker;
    ctx.fillStyle = rgb(mix([255, 120, 40], accent, 0.35), 0.9);
    ctx.beginPath();
    ctx.moveTo(tx - 7, ty);
    ctx.quadraticCurveTo(tx - 6, ty - fh * 0.7, tx, ty - fh);
    ctx.quadraticCurveTo(tx + 6, ty - fh * 0.7, tx + 7, ty);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,236,170,.95)";
    ctx.beginPath();
    ctx.moveTo(tx - 3.5, ty);
    ctx.quadraticCurveTo(tx - 3, ty - fh * 0.45, tx, ty - fh * 0.62);
    ctx.quadraticCurveTo(tx + 3, ty - fh * 0.45, tx + 3.5, ty);
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------
  // Obelisk
  // ---------------------------------------------------------

  private drawObelisk(
    sim: ObeliskSim
  ) {
    const ctx = this.ctx;
    const gy = this.groundY;
    const bw = this.bw;
    const bh = this.bh;
    const cx = this.cx;

    // Plinth
    ctx.fillStyle = "#2d2536";
    ctx.fillRect(cx - bw * 0.78, gy, bw * 1.56, bh * 0.22);
    ctx.fillStyle = "#1c1724";
    ctx.fillRect(cx - bw * 0.92, gy + bh * 0.22, bw * 1.84, bh * 0.2);
    ctx.fillStyle = "rgba(242,196,90,.5)";
    ctx.fillRect(cx - bw * 0.78, gy, bw * 1.56, 1.5);

    // Back glow behind the column
    const back = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
    back.addColorStop(0, rgb(this.accent, 0));
    back.addColorStop(0.5, rgb(this.accent, 0.1));
    back.addColorStop(1, rgb(this.accent, 0));
    ctx.fillStyle = back;
    ctx.fillRect(cx - bw, 0, bw * 2, gy);

    const visible = Math.min(
      sim.blocks.length,
      Math.ceil((gy + this.drop) / bh) + 1
    );

    // Blocks bottom-up, blades after (so they overlap neighbours).
    for (let k = 0; k < visible; k++) {
      const block = sim.blocks[k];
      const top = gy - (k + 1) * bh - this.drop;
      this.drawBlock(block, cx - bw / 2, top, k);
    }

    for (let k = visible - 1; k >= 0; k--) {
      const block = sim.blocks[k];
      if (!block.blade) continue;
      const top = gy - (k + 1) * bh - this.drop;
      const lethal =
        this.hitBlade !== null &&
        this.hitBlade.index === block.index;
      this.drawBlade(block.blade, top + bh / 2, k, lethal);
    }
  }

  private drawBlock(
    block: Block,
    x: number,
    y: number,
    k: number,
    alpha = 1
  ) {
    const ctx = this.ctx;
    const bw = this.bw;
    const bh = this.bh;

    const base = block.ra
      ? ([214, 160, 52] as Rgb)
      : TONE_COLOURS[block.tone % TONE_COLOURS.length];

    const face = ctx.createLinearGradient(x, 0, x + bw, 0);
    face.addColorStop(0, rgb(mix(base, [255, 240, 210], 0.22), alpha));
    face.addColorStop(0.18, rgb(base, alpha));
    face.addColorStop(0.72, rgb(mix(base, [0, 0, 0], 0.28), alpha));
    face.addColorStop(1, rgb(mix(base, [0, 0, 0], 0.55), alpha));
    ctx.fillStyle = face;
    ctx.fillRect(x, y, bw, bh);

    // Seams
    ctx.fillStyle = `rgba(0,0,0,${0.55 * alpha})`;
    ctx.fillRect(x, y + bh - 2, bw, 2);
    ctx.fillStyle = block.ra
      ? `rgba(255,240,190,${0.8 * alpha})`
      : `rgba(255,236,200,${0.14 * alpha})`;
    ctx.fillRect(x, y, bw, 1.2);

    // Gold edge trims
    ctx.fillStyle = rgb(GLYPH_GOLD, (block.ra ? 0.9 : 0.28) * alpha);
    ctx.fillRect(x + 2, y + 3, 1.2, bh - 7);
    ctx.fillRect(x + bw - 3.2, y + 3, 1.2, bh - 7);

    if (block.ra) {
      // Pulsing sun glow
      const pulse = this.reducedMotion
        ? 0.7
        : 0.55 + 0.45 * Math.sin(this.time * 6);
      const glow = ctx.createRadialGradient(x + bw / 2, y + bh / 2, 2, x + bw / 2, y + bh / 2, bw * 0.9);
      glow.addColorStop(0, `rgba(255,214,110,${0.4 * pulse * alpha})`);
      glow.addColorStop(1, "rgba(255,214,110,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - bw * 0.4, y - bh * 0.8, bw * 1.8, bh * 2.6);
      this.glyph(SUN, x + bw / 2, y + bh / 2, bh / 22, [255, 248, 220], 0.95 * alpha, 1.8);
    } else {
      const glyph = GLYPHS[block.index % GLYPHS.length];
      const inlay = mix(GLYPH_GOLD, this.accent, 0.4);
      this.glyph(glyph, x + bw / 2, y + bh / 2, bh / 26, inlay, (0.5 - Math.min(0.3, k * 0.025)) * alpha, 1.6);
    }

    // Depth fog for higher blocks
    if (k > 2) {
      ctx.fillStyle = `rgba(6,8,22,${Math.min(0.4, (k - 2) * 0.045) * alpha})`;
      ctx.fillRect(x, y, bw, bh);
    }
  }

  private glyph(
    path: GlyphPath,
    x: number,
    y: number,
    scale: number,
    colour: Rgb,
    alpha: number,
    width: number
  ) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Carved: dark groove offset, then the inlay.
    ctx.translate(0, 0.9);
    path(ctx);
    ctx.strokeStyle = `rgba(0,0,0,${0.5 * alpha})`;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.translate(0, -0.9);
    path(ctx);
    ctx.strokeStyle = rgb(colour, alpha);
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }

  /** A horizontal blade sticking out of the column at height `y`. */
  private drawBlade(
    side: Side,
    y: number,
    k: number,
    lethal: boolean,
    originX?: number,
    alpha = 1
  ) {
    const ctx = this.ctx;
    const dir = side === "L"
      ? -1
      : 1;
    const x0 = originX ?? this.cx + dir * (this.bw / 2);
    const bl = this.bl;
    const t = this.bh * 0.17;

    // Danger glow: brighter the lower it is.
    const near = k <= 1;
    const pulse = this.reducedMotion
      ? 0.8
      : 0.65 + 0.35 * Math.sin(this.time * 8 + k);
    const strength = lethal
      ? 0.75
      : near
        ? 0.34 * pulse + 0.12
        : 0.16;

    const gx = x0 + dir * bl * 0.55;
    const glow = ctx.createRadialGradient(gx, y, 2, gx, y, bl * 0.75);
    glow.addColorStop(0, `rgba(255,60,70,${strength * alpha})`);
    glow.addColorStop(1, "rgba(255,60,70,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(gx - bl * 0.75, y - bl * 0.75, bl * 1.5, bl * 1.5);

    ctx.save();
    ctx.translate(x0, y);
    ctx.scale(dir, 1);

    // Bracket
    ctx.fillStyle = rgb([196, 150, 64], alpha);
    ctx.fillRect(-2, -t * 1.25, bl * 0.14, t * 2.5);
    ctx.fillStyle = rgb([255, 226, 150], 0.7 * alpha);
    ctx.fillRect(-2, -t * 1.25, bl * 0.14, 1.2);

    // Blade: spine slightly rising, curved cutting edge, sharp tip.
    ctx.beginPath();
    ctx.moveTo(bl * 0.12, -t);
    ctx.lineTo(bl * 0.86, -t * 0.55);
    ctx.lineTo(bl, 0);
    ctx.quadraticCurveTo(bl * 0.62, t * 1.7, bl * 0.12, t);
    ctx.closePath();
    const steel = ctx.createLinearGradient(0, -t, 0, t * 1.4);
    steel.addColorStop(0, rgb([236, 240, 250], alpha));
    steel.addColorStop(0.45, rgb([150, 158, 180], alpha));
    steel.addColorStop(1, rgb([70, 72, 92], alpha));
    ctx.fillStyle = steel;
    ctx.fill();

    // Hot edge
    ctx.beginPath();
    ctx.moveTo(bl, 0);
    ctx.quadraticCurveTo(bl * 0.62, t * 1.7, bl * 0.12, t);
    ctx.strokeStyle = lethal
      ? `rgba(255,90,90,${alpha})`
      : `rgba(255,${near ? 96 : 140},${near ? 96 : 110},${(near ? 0.95 : 0.7) * alpha})`;
    ctx.lineWidth = near || lethal ? 2.4 : 1.6;
    ctx.stroke();

    // Ridge
    ctx.beginPath();
    ctx.moveTo(bl * 0.14, 0);
    ctx.lineTo(bl * 0.9, -t * 0.12);
    ctx.strokeStyle = `rgba(255,255,255,${0.45 * alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  // ---------------------------------------------------------
  // Player
  // ---------------------------------------------------------

  private drawPlayer(
    side: Side,
    alpha: number,
    sim: ObeliskSim,
    ghost: boolean
  ) {
    if (alpha <= 0) return;

    const ctx = this.ctx;
    const x = this.playerX(side);
    const gy = this.groundY;
    const u = this.ph / 100;
    // Faces the obelisk.
    const f = side === "L"
      ? 1
      : -1;

    let tilt = 0;
    let drop = 0;
    let fade = alpha;

    if (!ghost && this.deathAge >= 0) {
      const t = this.reducedMotion
        ? 1
        : easeOut(clamp01(this.deathAge / 0.45));
      if (this.deathBy === "cut") {
        tilt = -0.95 * t;
        drop = 0;
      } else {
        tilt = -0.25 * t;
        drop = 8 * t;
      }
      fade = alpha * (1 - 0.3 * t);
    }

    ctx.save();

    // Shadow
    ctx.fillStyle = `rgba(0,0,0,${0.45 * fade})`;
    ctx.beginPath();
    ctx.ellipse(x, gy + 2, 26 * u, 6 * u, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(x, gy);
    ctx.scale(f * u, u);
    ctx.rotate(tilt);
    ctx.translate(0, drop);
    ctx.globalAlpha = fade;

    const bob = this.reducedMotion || sim.dead
      ? 0
      : Math.sin(this.time * 3.2) * 1.2;

    // Cape (behind)
    ctx.fillStyle = "#2a1340";
    ctx.beginPath();
    ctx.moveTo(-4, -64 + bob);
    ctx.quadraticCurveTo(-26, -40, -30, -2);
    ctx.lineTo(-6, -4);
    ctx.lineTo(4, -60 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(242,196,90,.75)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-4, -64 + bob);
    ctx.quadraticCurveTo(-26, -40, -30, -2);
    ctx.stroke();

    // Legs + boots
    ctx.fillStyle = "#14101f";
    ctx.fillRect(-9, -34, 7.5, 32);
    ctx.fillRect(2, -34, 7.5, 32);
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(-10, -6, 9.5, 6);
    ctx.fillRect(1.5, -6, 10, 6);

    // Torso (jacket)
    ctx.fillStyle = "#1b1834";
    ctx.beginPath();
    ctx.moveTo(-12, -66 + bob);
    ctx.lineTo(13, -66 + bob);
    ctx.lineTo(11, -32);
    ctx.lineTo(-11, -32);
    ctx.closePath();
    ctx.fill();
    // Rim light on the obelisk side
    ctx.fillStyle = rgb(this.accent, 0.55);
    ctx.fillRect(10, -64 + bob, 2.4, 30);
    // Belt
    ctx.fillStyle = "#c99a3e";
    ctx.fillRect(-11, -37, 22, 3);
    // Collar
    ctx.fillStyle = "#0d0b18";
    ctx.fillRect(-7, -70 + bob, 14, 6);

    // Millennium Puzzle pendant
    ctx.fillStyle = "#f2c45a";
    ctx.beginPath();
    ctx.moveTo(-5, -56 + bob);
    ctx.lineTo(7, -56 + bob);
    ctx.lineTo(1, -46 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#6b4a12";
    ctx.beginPath();
    ctx.arc(1, -53 + bob, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // Head
    const hy = -80 + bob;
    ctx.fillStyle = "#d4ac80";
    ctx.beginPath();
    ctx.arc(2, hy, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(60,30,20,.35)";
    ctx.beginPath();
    ctx.arc(-1, hy + 1, 9.5, Math.PI * 0.6, Math.PI * 1.4);
    ctx.fill();
    // Eye
    ctx.fillStyle = sim.dead && !ghost
      ? "#3a2a2a"
      : "#2a1630";
    ctx.fillRect(6, hy - 1.5, 2.6, 2.6);

    // Spiky hair: dark with crimson tips
    const hair = ctx.createLinearGradient(0, hy - 32, 0, hy);
    hair.addColorStop(0, "#c0306a");
    hair.addColorStop(0.45, "#3a1238");
    hair.addColorStop(1, "#140a1c");
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-10, hy + 2);
    ctx.lineTo(-22, hy - 10);
    ctx.lineTo(-10, hy - 10);
    ctx.lineTo(-14, hy - 26);
    ctx.lineTo(-3, hy - 14);
    ctx.lineTo(0, hy - 32);
    ctx.lineTo(5, hy - 14);
    ctx.lineTo(14, hy - 27);
    ctx.lineTo(11, hy - 10);
    ctx.lineTo(20, hy - 12);
    ctx.lineTo(11, hy - 3);
    ctx.lineTo(4, hy - 7);
    ctx.lineTo(-6, hy - 4);
    ctx.closePath();
    ctx.fill();
    // Golden bangs
    ctx.fillStyle = "#f2c45a";
    ctx.beginPath();
    ctx.moveTo(3, hy - 9);
    ctx.lineTo(9, hy - 2);
    ctx.lineTo(6, hy + 1);
    ctx.lineTo(8, hy + 6);
    ctx.lineTo(3, hy - 1);
    ctx.closePath();
    ctx.fill();

    // Arm + axe: rest = raised behind, hit = forward into the stone.
    const swing = this.reducedMotion
      ? (this.swing < 0.5 ? 0 : 1)
      : easeOut(this.swing);
    const rest = -2.05;
    const hit = 0.18;
    const angle = sim.dead && !ghost
      ? -0.6
      : hit + (rest - hit) * swing;

    ctx.save();
    ctx.translate(5, -60 + bob);
    ctx.rotate(angle);
    // Sleeve
    ctx.strokeStyle = "#1b1834";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(19, 0);
    ctx.stroke();
    // Hand
    ctx.fillStyle = "#d4ac80";
    ctx.beginPath();
    ctx.arc(21, 0, 3.4, 0, Math.PI * 2);
    ctx.fill();
    // Haft
    ctx.strokeStyle = "#8a5a22";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(50, 0);
    ctx.stroke();
    ctx.strokeStyle = "#f2c45a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(26, -1.5);
    ctx.lineTo(26, 1.5);
    ctx.moveTo(36, -1.5);
    ctx.lineTo(36, 1.5);
    ctx.stroke();
    // Crescent axe head (Egyptian epsilon axe), facing down-forward
    const headGrad = ctx.createLinearGradient(42, -12, 52, 16);
    headGrad.addColorStop(0, "#fff0b8");
    headGrad.addColorStop(0.5, "#f2c45a");
    headGrad.addColorStop(1, "#9a6a1e");
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.moveTo(41, -4);
    ctx.lineTo(50, -4);
    ctx.quadraticCurveTo(60, -2, 58, 16);
    ctx.quadraticCurveTo(50, 9, 41, 12);
    ctx.quadraticCurveTo(45, 4, 41, -4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,250,230,.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(57.5, 14);
    ctx.quadraticCurveTo(59.5, 0, 50, -3.5);
    ctx.stroke();
    ctx.restore();

    // Motion arc right after a hit
    if (!ghost && this.swing < 0.6 && !this.reducedMotion) {
      ctx.strokeStyle = rgb(this.accent, 0.5 * (1 - this.swing / 0.6));
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(5, -60 + bob, 56, rest + 0.6, hit, false);
      ctx.stroke();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------
  // Particles
  // ---------------------------------------------------------

  private stepParticles(
    dt: number
  ) {
    if (dt <= 0) return;

    for (const piece of this.flying) {
      piece.age += dt;
      piece.vy += 2200 * dt;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.rot += piece.vr * dt;
    }

    this.flying = this.flying.filter(
      (piece) => piece.age < 0.9
    );

    for (const chip of this.chips) {
      chip.age += dt;
      chip.vy += 1500 * dt;
      chip.x += chip.vx * dt;
      chip.y += chip.vy * dt;
      chip.rot += chip.vr * dt;
    }

    this.chips = this.chips.filter(
      (chip) => chip.age < chip.life
    );

    for (const text of this.floats) {
      text.age += dt;
    }

    this.floats = this.floats.filter(
      (text) => text.age < 0.9
    );

    for (const ring of this.rings) {
      ring.age += dt;
    }

    this.rings = this.rings.filter(
      (ring) => ring.age < 0.6
    );
  }

  private drawFlying() {
    const ctx = this.ctx;

    for (const piece of this.flying) {
      const alpha = clamp01(1 - (piece.age - 0.35) / 0.5);
      if (alpha <= 0) continue;
      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rot);
      ctx.translate(-this.bw / 2, -this.bh / 2);
      // drawBlock works in absolute coords; draw at the local origin.
      this.drawBlock(piece.block, 0, 0, 0, alpha);
      if (piece.block.blade) {
        const dir = piece.block.blade === "L"
          ? 0
          : this.bw;
        this.drawBlade(piece.block.blade, this.bh / 2, 5, false, dir, alpha);
      }
      ctx.restore();
    }
  }

  private drawChips() {
    const ctx = this.ctx;

    for (const chip of this.chips) {
      const alpha = clamp01(1 - chip.age / chip.life);
      ctx.save();
      ctx.translate(chip.x, chip.y);
      ctx.rotate(chip.rot);
      ctx.fillStyle = chip.gold
        ? `rgba(255,214,110,${alpha})`
        : `rgba(120,104,128,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(-chip.size, -chip.size * 0.6);
      ctx.lineTo(chip.size, -chip.size * 0.2);
      ctx.lineTo(-chip.size * 0.2, chip.size);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawRings() {
    const ctx = this.ctx;

    for (const ring of this.rings) {
      const t = ring.age / 0.6;
      ctx.strokeStyle = rgb(ring.colour, (1 - t) * 0.8);
      ctx.lineWidth = 3 * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, ring.max * easeOut(t), ring.max * 0.35 * easeOut(t), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawFloats() {
    const ctx = this.ctx;

    for (const text of this.floats) {
      const t = text.age / 0.9;
      ctx.font = `900 ${Math.round(this.bh * 0.5)}px ${this.fontBody}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(0,0,0,${0.5 * (1 - t)})`;
      ctx.fillText(text.text, text.x + 1, text.y - t * this.bh * 1.4 + 2);
      ctx.fillStyle = `rgba(255,226,140,${1 - t})`;
      ctx.fillText(text.text, text.x, text.y - t * this.bh * 1.4);
    }
  }
}
