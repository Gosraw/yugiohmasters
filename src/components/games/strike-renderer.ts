import {
  FLIGHT_TICKS,
  type BossItem,
  type Stage,
  type StrikeEvent,
  type StrikeSim,
} from "@/lib/games/strike-engine";

// =========================================================
// MILLENNIUM STRIKE - canvas renderer (render only: nothing here
// feeds back into the simulation, so Math.sin / random are fine).
//
// The Night Temple photo is the CSS background behind the canvas;
// this draws, on a transparent canvas:
//
//   - the golden Millennium wheel (pre-rendered to an offscreen
//     sprite per stage, drawn rotated each frame): engraved rim,
//     a ring of hieroglyphs, the Wedjat / Item emblem, a fixed
//     metallic sheen and a glow; boss wheels get their Item's
//     emblem, colour and a spiked corona;
//   - stuck cards (drawn before the disk so their tops look
//     embedded), shadow cards (pre-stuck, violet), Eye orbs;
//   - the card in hand, its flight streak, hit sparks, the wheel
//     kick, the shatter into gold shards, and on a clash the
//     bouncing card, slow motion and cards scattering off;
//   - the "cards left" column at the bottom left.
//
// prefers-reduced-motion: no shake, no kick, no slow motion, no
// flying shards / scatter (short fades instead), no ray spin.
// devicePixelRatio is capped at 2.
// =========================================================

const DEG = Math.PI / 180;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "spark" | "dust";
};

type Shard = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  pts: [number, number][];
  fill: string;
  life: number;
};

type FlyingCard = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  shadow: boolean;
  life: number;
};

type FloatText = {
  x: number;
  y: number;
  text: string;
  life: number;
};

type Palette = {
  glow: string;
  tint: string | null;
  light: string;
  mid: string;
  dark: string;
  edge: string;
};

const GOLD: Palette = {
  glow: "255,205,96",
  tint: null,
  light: "#fff2c4",
  mid: "#f0bf55",
  dark: "#b07a22",
  edge: "#6a420e",
};

const BOSS_PALETTES: Record<BossItem, Palette> = {
  puzzle: {
    ...GOLD,
    glow: "255,214,110",
  },
  eye: {
    glow: "255,92,60",
    tint: "rgba(210,50,25,.24)",
    light: "#ffe2b8",
    mid: "#eaa24a",
    dark: "#a2501c",
    edge: "#5a1a08",
  },
  rod: {
    glow: "178,124,255",
    tint: "rgba(120,60,220,.3)",
    light: "#fbeec8",
    mid: "#e3b85a",
    dark: "#94641e",
    edge: "#3c2058",
  },
  ring: {
    glow: "255,244,205",
    tint: "rgba(255,252,236,.2)",
    light: "#fffbe8",
    mid: "#f3d688",
    dark: "#b8913a",
    edge: "#6d5418",
  },
  scale: {
    glow: "80,224,200",
    tint: "rgba(30,170,150,.2)",
    light: "#f6f2cc",
    mid: "#ddc25a",
    dark: "#8a7a24",
    edge: "#174a44",
  },
  key: {
    glow: "106,168,255",
    tint: "rgba(40,110,255,.3)",
    light: "#f4f0d8",
    mid: "#dcbc62",
    dark: "#8c6c26",
    edge: "#152a5c",
  },
  necklace: {
    glow: "80,224,138",
    tint: "rgba(30,170,90,.2)",
    light: "#f6f4cc",
    mid: "#e0c25a",
    dark: "#8a7020",
    edge: "#143e24",
  },
};

function paletteFor(
  stage: Stage
) {
  return stage.boss
    ? BOSS_PALETTES[stage.boss]
    : GOLD;
}

function easeOutBack(
  t: number
) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = t - 1;

  return 1 + c3 * x * x * x + c1 * x * x;
}

// ---------------------------------------------------------
// Emblems: unit coordinates (about -1..1), y down.
// ---------------------------------------------------------

type Emblem = "wedjat" | BossItem;

function almond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number
) {
  ctx.moveTo(cx - w, cy);
  ctx.quadraticCurveTo(cx, cy - h * 2, cx + w, cy);
  ctx.quadraticCurveTo(cx, cy + h * 1.4, cx - w, cy);
}

function emblemPath(
  ctx: CanvasRenderingContext2D,
  emblem: Emblem
) {
  ctx.beginPath();

  switch (emblem) {
    case "wedjat": {
      almond(ctx, 0, -0.05, 0.78, 0.36);
      ctx.moveTo(0.24, -0.08);
      ctx.arc(0, -0.08, 0.24, 0, Math.PI * 2);
      // brow
      ctx.moveTo(-0.82, -0.52);
      ctx.quadraticCurveTo(0, -0.95, 0.86, -0.5);
      // tear + spiral
      ctx.moveTo(-0.12, 0.26);
      ctx.lineTo(-0.2, 0.62);
      ctx.quadraticCurveTo(-0.32, 0.86, -0.56, 0.74);
      ctx.quadraticCurveTo(-0.66, 0.6, -0.5, 0.56);
      ctx.moveTo(0.2, 0.26);
      ctx.lineTo(0.34, 0.7);
      break;
    }

    case "puzzle": {
      ctx.moveTo(-0.88, -0.58);
      ctx.lineTo(0.88, -0.58);
      ctx.lineTo(0, 0.92);
      ctx.closePath();
      almond(ctx, 0, -0.22, 0.4, 0.17);
      ctx.moveTo(0.1, -0.24);
      ctx.arc(0, -0.24, 0.1, 0, Math.PI * 2);
      ctx.moveTo(-0.5, 0.06);
      ctx.lineTo(0.5, 0.06);
      ctx.moveTo(-0.3, 0.4);
      ctx.lineTo(0.3, 0.4);
      ctx.moveTo(-0.44, -0.58);
      ctx.lineTo(-0.3, -0.36);
      ctx.moveTo(0.44, -0.58);
      ctx.lineTo(0.3, -0.36);
      break;
    }

    case "eye": {
      almond(ctx, 0, 0, 0.9, 0.42);
      ctx.moveTo(0.34, -0.04);
      ctx.arc(0, -0.04, 0.34, 0, Math.PI * 2);
      ctx.moveTo(0.14, -0.04);
      ctx.arc(0, -0.04, 0.14, 0, Math.PI * 2);
      ctx.moveTo(-0.9, -0.5);
      ctx.quadraticCurveTo(0, -1.0, 0.9, -0.5);
      ctx.moveTo(-0.14, 0.34);
      ctx.quadraticCurveTo(-0.2, 0.8, -0.5, 0.78);
      ctx.moveTo(0.22, 0.34);
      ctx.lineTo(0.32, 0.8);
      break;
    }

    case "rod": {
      ctx.moveTo(0, -0.16);
      ctx.lineTo(0, 0.95);
      ctx.moveTo(-0.12, 0.95);
      ctx.lineTo(0.12, 0.95);
      ctx.moveTo(0.24, -0.4);
      ctx.arc(0, -0.4, 0.24, 0, Math.PI * 2);
      almond(ctx, 0, -0.4, 0.15, 0.06);
      ctx.moveTo(-0.22, -0.48);
      ctx.quadraticCurveTo(-0.55, -0.62, -0.78, -0.94);
      ctx.quadraticCurveTo(-0.6, -0.5, -0.24, -0.26);
      ctx.moveTo(0.22, -0.48);
      ctx.quadraticCurveTo(0.55, -0.62, 0.78, -0.94);
      ctx.quadraticCurveTo(0.6, -0.5, 0.24, -0.26);
      break;
    }

    case "ring": {
      ctx.moveTo(0.66, 0);
      ctx.arc(0, 0, 0.66, 0, Math.PI * 2);
      ctx.moveTo(-0.46, -0.3);
      ctx.lineTo(0.46, -0.3);
      ctx.lineTo(0, 0.5);
      ctx.closePath();
      almond(ctx, 0, -0.08, 0.2, 0.08);
      for (let i = 0; i < 5; i++) {
        const a = (40 + i * 25) * DEG;
        ctx.moveTo(Math.cos(a) * 0.66, Math.sin(a) * 0.66);
        ctx.lineTo(Math.cos(a) * 0.96, Math.sin(a) * 0.96);
      }
      break;
    }

    case "scale": {
      ctx.moveTo(0, -0.72);
      ctx.lineTo(0, 0.72);
      ctx.moveTo(-0.34, 0.86);
      ctx.lineTo(0.34, 0.86);
      ctx.lineTo(0, 0.62);
      ctx.closePath();
      ctx.moveTo(-0.82, -0.46);
      ctx.lineTo(0.82, -0.46);
      for (const side of [-1, 1]) {
        const x = side * 0.66;
        ctx.moveTo(side * 0.82, -0.46);
        ctx.lineTo(x - 0.24, 0.12);
        ctx.moveTo(side * 0.5, -0.46);
        ctx.lineTo(x + 0.24, 0.12);
        ctx.moveTo(x - 0.3, 0.12);
        ctx.quadraticCurveTo(x, 0.46, x + 0.3, 0.12);
        ctx.closePath();
      }
      almond(ctx, 0, -0.78, 0.14, 0.06);
      break;
    }

    case "key": {
      ctx.ellipse(0, -0.46, 0.3, 0.38, 0, 0, Math.PI * 2);
      almond(ctx, 0, -0.46, 0.14, 0.06);
      ctx.moveTo(0, -0.08);
      ctx.lineTo(0, 0.92);
      ctx.moveTo(-0.58, 0.06);
      ctx.lineTo(0.58, 0.06);
      ctx.moveTo(0, 0.6);
      ctx.lineTo(0.22, 0.6);
      ctx.moveTo(0, 0.78);
      ctx.lineTo(0.16, 0.78);
      break;
    }

    case "necklace": {
      ctx.moveTo(0.52, 0.08);
      ctx.arc(0, 0.08, 0.52, 0, Math.PI * 2);
      almond(ctx, 0, 0.08, 0.32, 0.14);
      ctx.moveTo(0.1, 0.06);
      ctx.arc(0, 0.06, 0.1, 0, Math.PI * 2);
      ctx.moveTo(-0.82, -0.2);
      ctx.quadraticCurveTo(-0.7, -0.92, 0, -0.94);
      ctx.quadraticCurveTo(0.7, -0.92, 0.82, -0.2);
      ctx.moveTo(-0.5, -0.36);
      ctx.lineTo(-0.66, -0.5);
      ctx.moveTo(0.5, -0.36);
      ctx.lineTo(0.66, -0.5);
      break;
    }
  }
}

// Small hieroglyphs for the rim band (unit ~ -1..1).
const RIM_GLYPHS: ((ctx: CanvasRenderingContext2D) => void)[] = [
  (ctx) => {
    ctx.ellipse(0, -0.45, 0.32, 0.4, 0, 0, Math.PI * 2);
    ctx.moveTo(0, -0.05);
    ctx.lineTo(0, 1);
    ctx.moveTo(-0.6, 0.15);
    ctx.lineTo(0.6, 0.15);
  },
  (ctx) => {
    almond(ctx, 0, 0, 0.9, 0.4);
    ctx.moveTo(0.22, -0.04);
    ctx.arc(0, -0.04, 0.22, 0, Math.PI * 2);
  },
  (ctx) => {
    ctx.moveTo(-0.7, 0.8);
    ctx.lineTo(0, -0.9);
    ctx.lineTo(0.7, 0.8);
    ctx.closePath();
  },
  (ctx) => {
    ctx.moveTo(-0.8, -0.6);
    ctx.quadraticCurveTo(-0.3, -0.9, 0, -0.5);
    ctx.quadraticCurveTo(0.3, -0.1, 0.8, -0.4);
    ctx.moveTo(-0.8, 0.3);
    ctx.quadraticCurveTo(-0.3, 0, 0, 0.4);
    ctx.quadraticCurveTo(0.3, 0.8, 0.8, 0.5);
  },
];

export class StrikeRenderer {
  private ctx: CanvasRenderingContext2D;

  private dpr = 1;

  private width = 0;

  private height = 0;

  private reducedMotion: boolean;

  // Layout (CSS px)
  private cx = 0;

  private cy = 0;

  private radius = 0;

  private cardW = 0;

  private cardH = 0;

  private handY = 0;

  // Sprites
  private wheelSprite: HTMLCanvasElement | null = null;

  private wheelKey = "";

  private cardSprite: HTMLCanvasElement | null = null;

  private shadowSprite: HTMLCanvasElement | null = null;

  private spriteScale = 1;

  // Effects
  private particles: Particle[] = [];

  private shards: Shard[] = [];

  private flying: FlyingCard[] = [];

  private texts: FloatText[] = [];

  private shake = 0;

  private kick = 0;

  private flash = 0;

  private flashColor = "255,236,170";

  private hitFlash = 0;

  private appear = 1;

  private handRaise = 1;

  private time = 0;

  private slow = 1;

  private dead = false;

  private deadAge = 0;

  private scattered = false;

  private deadAngle = 0;

  private deadVel = 0;

  private wheelHidden = false;

  private safeBottom = 0;

  private pendingScatter = false;

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

    const inter =
      getComputedStyle(document.documentElement).getPropertyValue("--font-inter").trim();

    if (inter) this.fontBody = `${inter}, system-ui, sans-serif`;
  }

  /**
   * `safeTop` / `safeBottom`: the notch / home-indicator insets (CSS
   * px). The wheel always sits below the score HUD.
   */
  resize(
    width: number,
    height: number,
    safeTop = 0,
    safeBottom = 0
  ) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);

    const usable =
      this.height - safeTop - safeBottom;

    this.radius = Math.max(40, Math.min(this.width * 0.3, usable * 0.18));
    this.cx = this.width / 2;
    this.cardW = this.radius * 0.18;
    this.cardH = this.radius * 0.48;
    this.safeBottom = safeBottom;

    // HUD (score, stage dots, label) needs ~118 px under the notch;
    // a boss wheel + a card on top reaches ~1.45 R above the hub.
    this.cy = Math.max(
      safeTop + 118 + this.radius * 1.45,
      safeTop + usable * 0.36
    );

    this.handY = Math.min(
      safeTop + usable * 0.86,
      this.height - safeBottom - this.cardH * 1.6 - 26
    );

    this.wheelKey = "";
    this.cardSprite = null;
    this.shadowSprite = null;
  }

  /** New run: forget effects. */
  reset() {
    this.particles = [];
    this.shards = [];
    this.flying = [];
    this.texts = [];
    this.shake = 0;
    this.kick = 0;
    this.flash = 0;
    this.hitFlash = 0;
    this.appear = this.reducedMotion ? 1 : 0;
    this.handRaise = 1;
    this.slow = 1;
    this.dead = false;
    this.deadAge = 0;
    this.scattered = false;
    this.pendingScatter = false;
    this.wheelHidden = false;
  }

  /** Effect clock factor (slow motion after a clash). */
  get timeScale() {
    return this.slow;
  }

  // ---------------------------------------------------------
  // Geometry
  // ---------------------------------------------------------

  /** Distance from the hub to a stuck card's centre. */
  private cardDist() {
    return this.radius + this.cardH * 0.5 - this.cardH * 0.2;
  }

  private impactY() {
    return this.cy + this.cardDist();
  }

  private wheelR(
    stage: Stage
  ) {
    return this.radius * (stage.boss ? 1.06 : 1);
  }

  private interpAngle(
    sim: StrikeSim,
    alpha: number
  ) {
    let delta = sim.angle - sim.prevAngle;

    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    return sim.prevAngle + delta * alpha;
  }

  private worldPos(
    angleDeg: number,
    dist: number
  ): [number, number] {
    return [
      this.cx + Math.cos(angleDeg * DEG) * dist,
      this.cy - this.kick + Math.sin(angleDeg * DEG) * dist,
    ];
  }

  // ---------------------------------------------------------
  // Events
  // ---------------------------------------------------------

  onEvents(
    sim: StrikeSim,
    events: StrikeEvent[]
  ) {
    for (const event of events) {
      switch (event.type) {
        case "throw":
          this.handRaise = 0;
          break;

        case "hit": {
          this.hitFlash = 1;

          if (!this.reducedMotion) {
            this.kick = this.radius * 0.05;
            this.shake = Math.max(this.shake, 2);
            this.burst(this.cx, this.impactY() - this.cardH * 0.5 + this.cardH * 0.2, 7, "255,226,150", 260, -Math.PI / 2, 1.3);
          }

          if (event.orb !== null) {
            const orb = sim.stage.orbs[event.orb];
            const [x, y] = this.worldPos(orb.a + sim.angle, this.wheelR(sim.stage) * 1.0);

            this.burst(x, y, this.reducedMotion ? 0 : 16, "255,210,110", 220, 0, Math.PI * 2);
            this.texts.push({
              x,
              y: y - 10,
              text: "+3",
              life: 0,
            });
          }
          break;
        }

        case "break":
          this.shatter(sim);
          break;

        case "stage":
          this.wheelHidden = false;
          this.appear = this.reducedMotion ? 1 : 0;
          this.handRaise = 0;
          this.wheelKey = "";
          break;

        case "clash":
          this.clash(sim);
          break;
      }
    }
  }

  private burst(
    x: number,
    y: number,
    count: number,
    color: string,
    speed: number,
    direction: number,
    spread: number
  ) {
    for (let i = 0; i < count; i++) {
      const a = direction + (Math.random() - 0.5) * spread;
      const v = speed * (0.4 + Math.random() * 0.8);

      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0,
        max: 0.35 + Math.random() * 0.35,
        size: 1 + Math.random() * 1.6,
        color,
        kind: "spark",
      });
    }
  }

  private shatter(
    sim: StrikeSim
  ) {
    const stage = sim.stage;
    const palette = paletteFor(stage);
    const r = this.wheelR(stage);
    const angle = sim.angle;

    this.wheelHidden = true;
    this.flash = 1;
    this.flashColor = palette.glow;

    if (this.reducedMotion) return;

    this.shake = Math.max(this.shake, stage.boss ? 9 : 6);

    // Wedge shards with jagged outer edges.
    const pieces = stage.boss ? 16 : 12;
    const fills = [palette.mid, palette.dark, palette.mid, palette.edge];

    for (let i = 0; i < pieces; i++) {
      const a0 = (i / pieces) * 360 + angle + (Math.random() - 0.5) * 6;
      const a1 = ((i + 1) / pieces) * 360 + angle + (Math.random() - 0.5) * 6;
      const mid = (a0 + a1) / 2;
      const inner = r * (0.05 + Math.random() * 0.25);
      const outer = r * (0.92 + Math.random() * 0.1);

      const pts: [number, number][] = [
        [Math.cos(a0 * DEG) * inner, Math.sin(a0 * DEG) * inner],
        [Math.cos(a0 * DEG) * outer, Math.sin(a0 * DEG) * outer],
        [Math.cos(mid * DEG) * (outer * (0.9 + Math.random() * 0.12)), Math.sin(mid * DEG) * (outer * (0.9 + Math.random() * 0.12))],
        [Math.cos(a1 * DEG) * outer, Math.sin(a1 * DEG) * outer],
        [Math.cos(a1 * DEG) * inner, Math.sin(a1 * DEG) * inner],
      ];

      const v = 180 + Math.random() * 260;

      this.shards.push({
        x: this.cx,
        y: this.cy,
        vx: Math.cos(mid * DEG) * v,
        vy: Math.sin(mid * DEG) * v - 120,
        rot: 0,
        vr: (Math.random() - 0.5) * 9,
        pts,
        fill: fills[i % fills.length],
        life: 0,
      });
    }

    // The stuck cards fly off with the pieces.
    for (const card of sim.stuck) {
      const world = card.a + angle;
      const [x, y] = this.worldPos(world, this.cardDist());
      const v = 260 + Math.random() * 220;

      this.flying.push({
        x,
        y,
        vx: Math.cos(world * DEG) * v,
        vy: Math.sin(world * DEG) * v - 160,
        rot: (world - 90) * DEG,
        vr: (Math.random() - 0.5) * 14,
        shadow: card.pre,
        life: 0,
      });
    }

    // Gold dust.
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 320;

      this.particles.push({
        x: this.cx + Math.cos(a) * r * Math.random(),
        y: this.cy + Math.sin(a) * r * Math.random(),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 80,
        life: 0,
        max: 0.6 + Math.random() * 0.7,
        size: 1 + Math.random() * 2.2,
        color: palette.glow,
        kind: "dust",
      });
    }
  }

  private clash(
    sim: StrikeSim
  ) {
    this.dead = true;
    this.deadAge = 0;
    this.deadAngle = sim.angle;
    this.deadVel = sim.vel;
    this.flash = 0.9;
    this.flashColor = "255,90,70";

    const x = this.cx;
    const y = this.impactY();

    if (this.reducedMotion) return;

    this.slow = 0.22;
    this.shake = 10;

    const side = Math.random() < 0.5 ? -1 : 1;

    this.flying.push({
      x,
      y: y + this.cardH * 0.1,
      vx: side * (140 + Math.random() * 90),
      vy: 360,
      rot: 0,
      vr: side * (7 + Math.random() * 4),
      shadow: false,
      life: 0,
    });

    this.burst(x, y - this.cardH * 0.45, 22, "255,120,90", 420, Math.PI / 2, Math.PI * 1.6);
    this.burst(x, y - this.cardH * 0.45, 12, "255,236,190", 300, -Math.PI / 2, Math.PI);
  }

  /** Clash aftermath: the remaining cards come loose (drawn next frame). */
  private scatter() {
    this.scattered = true;
    this.pendingScatter = true;
  }

  // ---------------------------------------------------------
  // Sprites
  // ---------------------------------------------------------

  private makeCanvas(
    w: number,
    h: number
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(w * this.dpr));
    canvas.height = Math.max(1, Math.ceil(h * this.dpr));
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    return {
      canvas,
      ctx,
    };
  }

  private buildCardSprite(
    shadow: boolean
  ) {
    const w = this.cardW;
    const h = this.cardH;
    const pad = 6;
    const {
      canvas,
      ctx,
    } = this.makeCanvas(w + pad * 2, h + pad * 2);

    ctx.translate(pad, pad);

    const r = Math.max(1.5, w * 0.12);

    const rounded = (x: number, y: number, rw: number, rh: number, rr: number) => {
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + rw - rr, y);
      ctx.quadraticCurveTo(x + rw, y, x + rw, y + rr);
      ctx.lineTo(x + rw, y + rh - rr);
      ctx.quadraticCurveTo(x + rw, y + rh, x + rw - rr, y + rh);
      ctx.lineTo(x + rr, y + rh);
      ctx.quadraticCurveTo(x, y + rh, x, y + rh - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
    };

    // Glow
    ctx.save();
    ctx.shadowColor = shadow ? "rgba(170,90,255,.9)" : "rgba(255,206,100,.85)";
    ctx.shadowBlur = 6;
    rounded(0, 0, w, h, r);
    ctx.fillStyle = shadow ? "#1a0f2e" : "#3a230c";
    ctx.fill();
    ctx.restore();

    // Back face
    const back = ctx.createLinearGradient(0, 0, w, h);

    if (shadow) {
      back.addColorStop(0, "#2a1748");
      back.addColorStop(0.5, "#160c2a");
      back.addColorStop(1, "#311a52");
    } else {
      back.addColorStop(0, "#6a3d14");
      back.addColorStop(0.5, "#3b200a");
      back.addColorStop(1, "#5c3311");
    }

    rounded(0, 0, w, h, r);
    ctx.fillStyle = back;
    ctx.fill();

    // Gold (or violet) frame
    ctx.lineWidth = Math.max(1, w * 0.09);
    ctx.strokeStyle = shadow ? "#a77bff" : "#f2c45a";
    rounded(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, r * 0.8);
    ctx.stroke();

    // Oval vortex
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
    const oval = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.3);
    oval.addColorStop(0, shadow ? "#b06cff" : "#ffdf8a");
    oval.addColorStop(0.45, shadow ? "#4a2280" : "#a05a14");
    oval.addColorStop(1, shadow ? "#1d0f38" : "#2a1606");
    ctx.fillStyle = oval;
    ctx.fill();

    // Eye in the oval
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(w * 0.2, w * 0.2);
    ctx.beginPath();
    almond(ctx, 0, 0, 1, 0.45);
    ctx.lineWidth = 0.22;
    ctx.strokeStyle = shadow ? "rgba(255,90,120,.95)" : "rgba(40,20,4,.85)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -0.02, 0.28, 0, Math.PI * 2);
    ctx.fillStyle = shadow ? "#ff5a7a" : "#2a1404";
    ctx.fill();
    ctx.restore();

    // Sheen
    const sheen = ctx.createLinearGradient(0, 0, w, h * 0.6);
    sheen.addColorStop(0, "rgba(255,255,255,.28)");
    sheen.addColorStop(0.4, "rgba(255,255,255,0)");
    rounded(0, 0, w, h, r);
    ctx.fillStyle = sheen;
    ctx.fill();

    return canvas;
  }

  private buildWheelSprite(
    stage: Stage
  ) {
    const R = this.wheelR(stage);
    const palette = paletteFor(stage);
    const size = R * 2 * 1.2;
    const {
      canvas,
      ctx,
    } = this.makeCanvas(size, size);

    ctx.translate(size / 2, size / 2);

    // Boss corona: spikes behind the disk.
    if (stage.boss) {
      const spikes = 18;
      ctx.beginPath();

      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? R * 1.16 : R * 0.96;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.closePath();
      const spikeFill = ctx.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.16);
      spikeFill.addColorStop(0, palette.dark);
      spikeFill.addColorStop(1, palette.edge);
      ctx.fillStyle = spikeFill;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${palette.glow},.6)`;
      ctx.stroke();
    }

    // Disk
    const base = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.05, 0, 0, R);
    base.addColorStop(0, palette.light);
    base.addColorStop(0.38, palette.mid);
    base.addColorStop(0.8, palette.dark);
    base.addColorStop(1, palette.edge);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = base;
    ctx.fill();

    // Rim band
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.arc(0, 0, R * 0.88, 0, Math.PI * 2, true);
    const rim = ctx.createLinearGradient(-R, -R, R, R);
    rim.addColorStop(0, palette.light);
    rim.addColorStop(0.5, palette.dark);
    rim.addColorStop(1, palette.mid);
    ctx.fillStyle = rim;
    ctx.fill();

    const engrave = "rgba(60,32,4,.62)";
    const highlight = "rgba(255,246,214,.55)";

    const ring = (rr: number, width: number) => {
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.lineWidth = width;
      ctx.strokeStyle = engrave;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-0.6, -0.6, rr, 0, Math.PI * 2);
      ctx.lineWidth = width * 0.5;
      ctx.strokeStyle = highlight;
      ctx.stroke();
    };

    ring(R * 0.88, Math.max(1, R * 0.014));
    ring(R * 0.7, Math.max(1, R * 0.012));
    ring(R * 0.985, Math.max(1, R * 0.01));

    // Rim studs
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = Math.cos(a) * R * 0.94;
      const y = Math.sin(a) * R * 0.94;
      ctx.beginPath();
      ctx.arc(x, y, R * 0.018, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? palette.light : palette.edge;
      ctx.fill();
    }

    // Hieroglyph band
    const glyphs = 16;

    for (let i = 0; i < glyphs; i++) {
      const a = (i / glyphs) * Math.PI * 2;
      const gx = Math.cos(a) * R * 0.79;
      const gy = Math.sin(a) * R * 0.79;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(a + Math.PI / 2);
      const s = R * 0.055;
      ctx.scale(s, s);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      RIM_GLYPHS[i % RIM_GLYPHS.length](ctx);
      ctx.lineWidth = 0.32;
      ctx.strokeStyle = engrave;
      ctx.stroke();
      ctx.translate(-0.12, -0.12);
      ctx.lineWidth = 0.14;
      ctx.strokeStyle = highlight;
      ctx.stroke();
      ctx.restore();
    }

    // Inner medallion
    const inner = ctx.createRadialGradient(-R * 0.15, -R * 0.2, 0, 0, 0, R * 0.7);
    inner.addColorStop(0, palette.light);
    inner.addColorStop(0.7, palette.mid);
    inner.addColorStop(1, palette.dark);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.69, 0, Math.PI * 2);
    ctx.fillStyle = inner;
    ctx.fill();

    // Emblem: engraved (dark groove + light edge)
    const emblem: Emblem = stage.boss ?? "wedjat";
    ctx.save();
    const es = R * 0.5;
    ctx.scale(es, es);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    emblemPath(ctx, emblem);
    ctx.lineWidth = 0.085;
    ctx.strokeStyle = "rgba(58,30,4,.78)";
    ctx.stroke();
    ctx.translate(-0.022, -0.022);
    ctx.lineWidth = 0.034;
    ctx.strokeStyle = "rgba(255,248,220,.75)";
    ctx.stroke();
    ctx.restore();

    if (palette.tint) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = palette.tint;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.globalCompositeOperation = "source-over";
    }

    this.spriteScale = size;

    return canvas;
  }

  private ensureSprites(
    stage: Stage
  ) {
    const key = `${stage.index}:${this.radius}:${this.dpr}`;

    if (this.wheelKey !== key) {
      this.wheelSprite = this.buildWheelSprite(stage);
      this.wheelKey = key;
    }

    if (!this.cardSprite) this.cardSprite = this.buildCardSprite(false);
    if (!this.shadowSprite) this.shadowSprite = this.buildCardSprite(true);
  }

  // ---------------------------------------------------------
  // Frame
  // ---------------------------------------------------------

  draw(
    sim: StrikeSim,
    alpha: number,
    realDt: number,
    paused: boolean
  ) {
    const ctx = this.ctx;

    // Slow motion recovers over ~0.9 s of real time.
    if (!paused && this.slow < 1) {
      this.slow = Math.min(1, this.slow + realDt * 0.85);
    }

    const dt = paused ? 0 : realDt * this.slow;

    this.time += dt;

    this.ensureSprites(sim.stage);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // ---- screen shake ----
    if (this.shake > 0.05 && !this.reducedMotion) {
      const s = this.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      this.shake *= Math.exp(-realDt * 10);
    } else {
      this.shake = 0;
    }

    this.kick *= Math.exp(-dt * 18);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.flash = Math.max(0, this.flash - realDt * 2.6);
    this.handRaise = Math.min(1, this.handRaise + dt / 0.16);
    this.appear = Math.min(1, this.appear + dt / 0.42);

    // ---- wheel angle ----
    let angle: number;

    if (this.dead) {
      this.deadAge += dt;
      this.deadVel *= Math.exp(-dt * 1.4);
      this.deadAngle += this.deadVel * 60 * dt;
      angle = this.deadAngle;

      if (
        !this.scattered &&
        !this.reducedMotion &&
        this.deadAge > 0.12
      ) {
        this.scatter();
      }
    } else {
      angle = this.interpAngle(sim, alpha);
    }

    if (this.pendingScatter) {
      this.pendingScatter = false;

      for (const card of sim.stuck) {
        const world = card.a + angle;
        const [x, y] = this.worldPos(world, this.cardDist());
        const v = 140 + Math.random() * 160;

        this.flying.push({
          x,
          y,
          vx: Math.cos(world * DEG) * v,
          vy: Math.sin(world * DEG) * v - 80,
          rot: (world - 90) * DEG,
          vr: (Math.random() - 0.5) * 10,
          shadow: card.pre,
          life: 0,
        });
      }
    }

    const stage = sim.stage;
    const palette = paletteFor(stage);
    const R = this.wheelR(stage);
    const showWheel = !this.wheelHidden;
    const scale = this.reducedMotion
      ? 1
      : this.appear < 1
        ? Math.max(0.01, easeOutBack(this.appear))
        : 1;

    const wy = this.cy - this.kick;

    // ---- rays + glow behind the wheel ----
    if (showWheel) {
      this.drawRays(palette, R * scale, wy);

      const glow = ctx.createRadialGradient(this.cx, wy, R * 0.6 * scale, this.cx, wy, R * 1.9 * scale);
      const pulse = this.reducedMotion ? 0.32 : 0.28 + 0.06 * Math.sin(this.time * 2.2);
      glow.addColorStop(0, `rgba(${palette.glow},${pulse})`);
      glow.addColorStop(1, `rgba(${palette.glow},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(this.cx - R * 2 * scale, wy - R * 2 * scale, R * 4 * scale, R * 4 * scale);
    }

    // ---- stuck cards (under the disk so their tops look embedded) ----
    if (showWheel && !this.scattered) {
      const last = sim.stuck.length - 1;

      for (let i = 0; i < sim.stuck.length; i++) {
        const card = sim.stuck[i];
        const world = card.a + angle;
        const [x, y] = this.worldPos(world, this.cardDist() * scale);
        this.drawCard(x, y, (world - 90) * DEG, card.pre, scale, i === last && !card.pre ? this.hitFlash : 0);
      }
    }

    // ---- disk ----
    if (showWheel && this.wheelSprite) {
      const size = this.spriteScale * scale;
      ctx.save();
      ctx.translate(this.cx, wy);
      ctx.rotate(angle * DEG);
      ctx.drawImage(this.wheelSprite, -size / 2, -size / 2, size, size);
      ctx.restore();

      // Fixed sheen (light from the top left) + a hit flash.
      const sheen = ctx.createLinearGradient(this.cx - R, wy - R, this.cx + R * 0.4, wy + R * 0.6);
      sheen.addColorStop(0, `rgba(255,255,255,${0.22 + this.hitFlash * 0.18})`);
      sheen.addColorStop(0.45, "rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.arc(this.cx, wy, R * scale, 0, Math.PI * 2);
      ctx.fillStyle = sheen;
      ctx.fill();

      if (this.dead) {
        ctx.fillStyle = `rgba(20,4,8,${Math.min(0.42, this.deadAge * 1.2)})`;
        ctx.fill();
      }

      // ---- orbs ----
      for (const orb of stage.orbs) {
        if (orb.taken) continue;
        const [x, y] = this.worldPos(orb.a + angle, R * 1.0 * scale);
        this.drawOrb(x, y, R * 0.105 * scale, palette);
      }
    }

    // ---- flight streak + card in flight ----
    if (sim.flight !== null && !sim.dead) {
      const progress = Math.min(1, (sim.flight + alpha) / FLIGHT_TICKS);
      const y = this.handY + (this.impactY() - this.handY) * progress;

      const tail = Math.min(this.handY - y, this.cardH * 2.2);
      const streak = ctx.createLinearGradient(0, y, 0, y + this.cardH * 0.5 + tail);
      streak.addColorStop(0, "rgba(255,226,140,.6)");
      streak.addColorStop(1, "rgba(255,226,140,0)");
      ctx.fillStyle = streak;
      ctx.fillRect(this.cx - this.cardW * 0.3, y, this.cardW * 0.6, this.cardH * 0.5 + tail);

      this.drawCard(this.cx, y, 0, false, 1, 0.3);
    }

    // ---- hand: pedestal glow + next card ----
    this.drawHand(sim);

    // ---- shards, flying cards, particles, texts ----
    this.stepAndDrawShards(dt);
    this.stepAndDrawFlying(dt);
    this.stepAndDrawParticles(dt);
    this.stepAndDrawTexts(dt);

    // ---- cards left column ----
    this.drawCardsLeft(sim);

    // ---- full-screen flash ----
    if (this.flash > 0) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const flash = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, Math.max(this.width, this.height) * 0.8);
      flash.addColorStop(0, `rgba(${this.flashColor},${0.55 * this.flash})`);
      flash.addColorStop(1, `rgba(${this.flashColor},0)`);
      ctx.fillStyle = flash;
      ctx.fillRect(0, 0, this.width, this.height);
    }

  }

  private drawRays(
    palette: Palette,
    R: number,
    wy: number
  ) {
    const ctx = this.ctx;
    const rays = 12;
    const spin = this.reducedMotion ? 0 : this.time * 0.12;
    const reach = Math.max(this.width, this.height) * 0.9;

    ctx.save();
    ctx.translate(this.cx, wy);
    ctx.rotate(spin);
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const w = 0.07;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - w) * R, Math.sin(a - w) * R);
      ctx.lineTo(Math.cos(a - w * 1.6) * reach, Math.sin(a - w * 1.6) * reach);
      ctx.lineTo(Math.cos(a + w * 1.6) * reach, Math.sin(a + w * 1.6) * reach);
      ctx.lineTo(Math.cos(a + w) * R, Math.sin(a + w) * R);
      ctx.closePath();
      const g = ctx.createRadialGradient(0, 0, R, 0, 0, reach);
      g.addColorStop(0, `rgba(${palette.glow},.065)`);
      g.addColorStop(1, `rgba(${palette.glow},0)`);
      ctx.fillStyle = g;
      ctx.fill();
    }

    ctx.restore();
  }

  private drawCard(
    x: number,
    y: number,
    rot: number,
    shadow: boolean,
    scale: number,
    flash: number
  ) {
    const sprite = shadow ? this.shadowSprite : this.cardSprite;

    if (!sprite) return;

    const ctx = this.ctx;
    const w = (this.cardW + 12) * scale;
    const h = (this.cardH + 12) * scale;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);

    if (flash > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255,236,180,${flash * 0.6})`;
      ctx.fillRect(-this.cardW / 2 * scale, -this.cardH / 2 * scale, this.cardW * scale, this.cardH * scale);
    }

    ctx.restore();
  }

  private drawOrb(
    x: number,
    y: number,
    r: number,
    palette: Palette
  ) {
    const ctx = this.ctx;
    const pulse = this.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(this.time * 5 + x * 0.05);

    const halo = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.4 * pulse);
    halo.addColorStop(0, `rgba(${palette.glow},.55)`);
    halo.addColorStop(1, `rgba(${palette.glow},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    body.addColorStop(0, "#fff6d4");
    body.addColorStop(0.6, "#f2c45a");
    body.addColorStop(1, "#8a5512");
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.strokeStyle = "#5a3408";
    ctx.stroke();

    // Eye
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(r * 0.72, r * 0.72);
    ctx.beginPath();
    almond(ctx, 0, 0.05, 1, 0.42);
    ctx.fillStyle = "#fff4dc";
    ctx.fill();
    ctx.lineWidth = 0.14;
    ctx.strokeStyle = "#3a1c04";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0.02, 0.34, 0, Math.PI * 2);
    ctx.fillStyle = "#b8321c";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0.02, 0.15, 0, Math.PI * 2);
    ctx.fillStyle = "#1a0802";
    ctx.fill();
    ctx.restore();
  }

  private drawHand(
    sim: StrikeSim
  ) {
    const ctx = this.ctx;
    const x = this.cx;
    const y = this.handY;

    // Magic circle under the hand.
    const rr = this.cardW * 2.4;
    const glow = ctx.createRadialGradient(x, y + this.cardH * 0.55, 0, x, y + this.cardH * 0.55, rr * 1.4);
    glow.addColorStop(0, "rgba(255,206,100,.35)");
    glow.addColorStop(1, "rgba(255,206,100,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(x, y + this.cardH * 0.55, rr * 1.4, rr * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y + this.cardH * 0.55);
    ctx.scale(1, 0.32);
    ctx.rotate(this.reducedMotion ? 0 : this.time * 0.6);
    ctx.strokeStyle = "rgba(255,216,120,.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * rr * 0.92;
      const py = Math.sin(a) * rr * 0.92;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    const hasCard =
      !sim.dead &&
      sim.flight === null &&
      sim.breakLeft === 0 &&
      sim.stageStuck < sim.stage.need;

    if (!hasCard) return;

    const raise = this.reducedMotion ? 1 : this.handRaise;
    const offset = (1 - raise) * this.cardH * 0.9;
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 3) * 1.5;

    this.drawCard(x, y + offset + bob, 0, false, 1, 0);
  }

  private drawCardsLeft(
    sim: StrikeSim
  ) {
    if (sim.dead && this.deadAge > 0.4) return;

    const ctx = this.ctx;
    const need = sim.stage.need;
    const used = sim.stageStuck + (sim.flight !== null ? 1 : 0);
    const w = 9;
    const h = 14;
    const gap = 5;
    const x = 18;
    const bottom = this.height - this.safeBottom - Math.max(24, this.height * 0.05);

    for (let i = 0; i < need; i++) {
      const y = bottom - i * (h + gap) - h;
      const left = i >= used;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.08);
      ctx.fillStyle = left ? "#f2c45a" : "rgba(242,196,90,.16)";
      ctx.strokeStyle = left ? "#fff0c0" : "rgba(242,196,90,.3)";
      ctx.lineWidth = 1;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      if (left) {
        ctx.fillStyle = "#5a3408";
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w * 0.24, h * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private stepAndDrawShards(
    dt: number
  ) {
    const ctx = this.ctx;

    for (const shard of this.shards) {
      shard.life += dt;
      shard.vy += 900 * dt;
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      shard.rot += shard.vr * dt;

      const alpha = Math.max(0, 1 - shard.life / 1.1);

      if (alpha <= 0) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(shard.x, shard.y);
      ctx.rotate(shard.rot);
      ctx.beginPath();
      shard.pts.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = shard.fill;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,246,214,.7)";
      ctx.stroke();
      ctx.restore();
    }

    this.shards = this.shards.filter((shard) => shard.life < 1.1);
  }

  private stepAndDrawFlying(
    dt: number
  ) {
    for (const card of this.flying) {
      card.life += dt;
      card.vy += 1300 * dt;
      card.x += card.vx * dt;
      card.y += card.vy * dt;
      card.rot += card.vr * dt;
      this.drawCard(card.x, card.y, card.rot, card.shadow, 1, 0);
    }

    this.flying = this.flying.filter(
      (card) => card.y < this.height + this.cardH * 2 && card.life < 4
    );
  }

  private stepAndDrawParticles(
    dt: number
  ) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const p of this.particles) {
      p.life += dt;
      p.vy += (p.kind === "dust" ? 260 : 520) * dt;
      p.vx *= Math.exp(-dt * 2);
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const alpha = Math.max(0, 1 - p.life / p.max);

      if (alpha <= 0) continue;

      if (p.kind === "spark") {
        ctx.strokeStyle = `rgba(${p.color},${alpha})`;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(${p.color},${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  private stepAndDrawTexts(
    dt: number
  ) {
    const ctx = this.ctx;

    for (const text of this.texts) {
      text.life += dt;
      const t = text.life / 0.9;

      if (t >= 1) continue;

      ctx.save();
      ctx.globalAlpha = 1 - t * t;
      ctx.font = `900 ${Math.round(this.radius * 0.17)}px ${this.fontBody}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(40,20,4,.8)";
      const y = text.y - t * 34;
      ctx.strokeText(text.text, text.x, y);
      ctx.fillStyle = "#ffe08a";
      ctx.fillText(text.text, text.x, y);
      ctx.restore();
    }

    this.texts = this.texts.filter((text) => text.life < 0.9);
  }
}
