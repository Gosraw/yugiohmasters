import {
  BASE_SIZE,
  type Piece,
  type Slab,
  type StackEvent,
  type StackSim,
} from "@/lib/games/stack-engine";

// =========================================================
// PYRAMID STACK - canvas renderer (render only: nothing here
// feeds back into the simulation, so Math.sin / random are fine).
//
// Isometric 2.5D view of the tower: every block is a sandstone
// slab with a lit top, two shaded sides and a carved Millennium
// glyph on each side. Even levels slide in from the left, odd
// levels from the right (the engine's x / z axes).
//
//   - camera rises smoothly with the tower; after a miss it zooms
//     out to show the whole tower;
//   - sky shifts with height: desert dusk -> night -> star sky;
//   - sliced-off pieces fall and fade (physics-lite);
//   - a perfect drop flashes gold with an expanding ring;
//   - best-score / leader lines across the sky;
//   - prefers-reduced-motion: no camera easing, no falling pieces,
//     no twinkle, no ring.
//
// devicePixelRatio is capped at 2.
// =========================================================

/** World units per level (slab thickness). */
export const SLAB_H = 22;

const ISO_C = 0.8660254;

const ISO_S = 0.5;

/** Below the base slab the pedestal reaches this far down. */
const PEDESTAL_DEPTH = 900;

export type StackMarker = {
  /** Blocks stacked (score). */
  score: number;
  label: string;
  kind: "best" | "rival";
};

type FallingPiece = Piece & {
  y: number;
  vy: number;
  vx: number;
  vz: number;
  age: number;
};

type Ring = {
  slab: Slab;
  age: number;
};

type Star = {
  x: number;
  y: number;
  r: number;
  phase: number;
};

type Rgb = [number, number, number];

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

// Sky stops by level: [level, top, middle, horizon].
const SKY: [number, Rgb, Rgb, Rgb][] = [
  [0, [44, 26, 78], [168, 82, 72], [244, 168, 96]],
  [14, [26, 20, 64], [92, 46, 86], [196, 104, 86]],
  [30, [8, 12, 40], [22, 28, 74], [64, 44, 96]],
  [55, [2, 3, 14], [6, 9, 30], [16, 20, 52]],
];

function skyAt(
  level: number
): [Rgb, Rgb, Rgb] {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [l0, t0, m0, h0] = SKY[i];
    const [l1, t1, m1, h1] = SKY[i + 1];

    if (level <= l1) {
      const t = clamp01((level - l0) / (l1 - l0));
      return [mix(t0, t1, t), mix(m0, m1, t), mix(h0, h1, t)];
    }
  }

  const last = SKY[SKY.length - 1];

  return [last[1], last[2], last[3]];
}

/** Sandstone colour of a level (top face, unshaded). */
function stoneColour(
  level: number,
  tone: number,
  phase: number
): Rgb {
  // Slow drift through sand / ochre / rose sandstone / pale limestone.
  const t = 0.5 + 0.5 * Math.sin(level * 0.33 + phase);
  const u = 0.5 + 0.5 * Math.sin(level * 0.13 + phase * 2.3);

  const sand: Rgb = [226, 186, 122];
  const ochre: Rgb = [210, 138, 70];
  const rose: Rgb = [206, 132, 112];
  const lime: Rgb = [232, 214, 170];

  const base = mix(
    mix(sand, ochre, t),
    mix(rose, lime, t),
    u * 0.6
  );

  const shift = (tone - 2.5) * 6;

  return [
    base[0] + shift,
    base[1] + shift,
    base[2] + shift * 0.8,
  ];
}

// ---------------------------------------------------------
// Glyphs, drawn in a local frame: x right, y DOWN, centred,
// about 14 units tall.
// ---------------------------------------------------------

type GlyphPath = (ctx: CanvasRenderingContext2D) => void;

const GLYPHS: GlyphPath[] = [
  // Wedjat (Millennium Eye)
  (ctx) => {
    ctx.beginPath();
    ctx.moveTo(-9, -1);
    ctx.quadraticCurveTo(0, -9, 9, -1);
    ctx.quadraticCurveTo(0, 5, -9, -1);
    ctx.moveTo(2.6, -1.5);
    ctx.arc(0, -1.5, 2.6, 0, Math.PI * 2);
    ctx.moveTo(-2, 3);
    ctx.quadraticCurveTo(-3, 8, -7, 7);
    ctx.moveTo(2, 3.4);
    ctx.lineTo(3.5, 7.5);
    ctx.moveTo(-9, -5);
    ctx.quadraticCurveTo(0, -11, 9, -5);
  },
  // Millennium Puzzle (inverted triangle with an eye)
  (ctx) => {
    ctx.beginPath();
    ctx.moveTo(-8, -6);
    ctx.lineTo(8, -6);
    ctx.lineTo(0, 7);
    ctx.closePath();
    ctx.moveTo(-4, -2.2);
    ctx.quadraticCurveTo(0, -5.2, 4, -2.2);
    ctx.quadraticCurveTo(0, 0.6, -4, -2.2);
    ctx.moveTo(1.1, -2.2);
    ctx.arc(0, -2.2, 1.1, 0, Math.PI * 2);
  },
  // Ankh
  (ctx) => {
    ctx.beginPath();
    ctx.ellipse(0, -4.5, 3.2, 3.6, 0, 0, Math.PI * 2);
    ctx.moveTo(0, -0.9);
    ctx.lineTo(0, 8);
    ctx.moveTo(-5.5, 1.2);
    ctx.lineTo(5.5, 1.2);
  },
  // Winged sun disk
  (ctx) => {
    ctx.beginPath();
    ctx.moveTo(3.2, 0);
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.moveTo(-4.5, -1);
    ctx.quadraticCurveTo(-8, -4, -11, -2);
    ctx.moveTo(-4.5, 1);
    ctx.quadraticCurveTo(-8, -1, -11, 1.5);
    ctx.moveTo(4.5, -1);
    ctx.quadraticCurveTo(8, -4, 11, -2);
    ctx.moveTo(4.5, 1);
    ctx.quadraticCurveTo(8, -1, 11, 1.5);
  },
  // Millennium Rod head / scarab
  (ctx) => {
    ctx.beginPath();
    ctx.ellipse(0, 0.5, 4, 5.5, 0, 0, Math.PI * 2);
    ctx.moveTo(0, -5);
    ctx.lineTo(0, 6);
    ctx.moveTo(-4, -3);
    ctx.lineTo(-8, -6.5);
    ctx.moveTo(4, -3);
    ctx.lineTo(8, -6.5);
    ctx.moveTo(-4, 3);
    ctx.lineTo(-7.5, 6.5);
    ctx.moveTo(4, 3);
    ctx.lineTo(7.5, 6.5);
  },
];

export class StackRenderer {
  private ctx: CanvasRenderingContext2D;

  private dpr = 1;

  private width = 0;

  private height = 0;

  private reducedMotion: boolean;

  private markers: StackMarker[] = [];

  private phase = Math.random() * Math.PI * 2;

  private stars: Star[] = [];

  private falling: FallingPiece[] = [];

  private rings: Ring[] = [];

  private flash = 0;

  private time = 0;

  // Camera
  private camY = SLAB_H;

  private zoom = 1;

  private anchor = 0.56;

  private gameOver = false;

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

    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() < 0.12 ? 1.4 : 0.5 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const inter =
      getComputedStyle(document.documentElement).getPropertyValue("--font-inter").trim();

    if (inter) this.fontBody = `${inter}, system-ui, sans-serif`;
  }

  setMarkers(
    markers: StackMarker[]
  ) {
    this.markers = markers;
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
  }

  /** New run: forget effects, put the camera on the base. */
  reset(
    sim: StackSim
  ) {
    this.falling = [];
    this.rings = [];
    this.flash = 0;
    this.gameOver = false;
    this.zoom = 1;
    this.anchor = 0.56;
    this.camY = this.targetCam(sim);
  }

  onEvents(
    events: StackEvent[]
  ) {
    for (const event of events) {
      if (event.type === "place") {
        if (event.cut) this.drop(event.cut);

        if (event.perfect) {
          this.flash = 1;
        }
      } else {
        this.drop(event.piece);
        this.gameOver = true;
      }
    }
  }

  /** Called after onEvents for a perfect place: ring around the new top. */
  ring(
    slab: Slab
  ) {
    if (this.reducedMotion) return;
    this.rings.push({
      slab,
      age: 0,
    });
  }

  private drop(
    piece: Piece
  ) {
    if (this.reducedMotion) return;

    // Pushed a little outward along the axis it was cut from.
    const outX = Math.sign(piece.x) * (piece.w < BASE_SIZE ? 30 : 0);
    const outZ = Math.sign(piece.z) * (piece.d < BASE_SIZE ? 30 : 0);

    this.falling.push({
      ...piece,
      y: piece.level * SLAB_H,
      vy: 0,
      vx: outX,
      vz: outZ,
      age: 0,
    });
  }

  private scale() {
    // A full-size block is ~60% of the column wide.
    return Math.min(this.width / 290, this.height / 470);
  }

  private targetCam(
    sim: StackSim
  ) {
    return (sim.slabs.length) * SLAB_H;
  }

  // ---------------------------------------------------------
  // Projection
  // ---------------------------------------------------------

  private sx(
    x: number,
    z: number
  ) {
    return this.width / 2 + (x - z) * ISO_C * this.scale() * this.zoom;
  }

  private sy(
    x: number,
    y: number,
    z: number
  ) {
    const s = this.scale() * this.zoom;
    return this.height * this.anchor + (x + z) * ISO_S * s - (y - this.camY) * s;
  }

  // ---------------------------------------------------------
  // Frame
  // ---------------------------------------------------------

  draw(
    sim: StackSim,
    alpha: number,
    dt: number,
    paused: boolean
  ) {
    const ctx = this.ctx;

    if (!paused) {
      this.time += dt;
    }

    // ---- camera ----
    const topLevel = sim.slabs.length - 1;

    let camTarget = this.targetCam(sim);
    let zoomTarget = 1;
    let anchorTarget = 0.56;

    if (this.gameOver && topLevel > 2) {
      // Whole tower in the area above the game-over card.
      const towerPx = (topLevel * SLAB_H + 170) * this.scale();
      zoomTarget = Math.max(0.12, Math.min(1, (this.height * 0.44) / towerPx));
      camTarget = (topLevel * SLAB_H) / 2;
      anchorTarget = 0.34;
    }

    if (this.reducedMotion) {
      this.camY = camTarget;
      this.zoom = zoomTarget;
      this.anchor = anchorTarget;
    } else {
      const k = 1 - Math.exp(-dt * (this.gameOver ? 3.2 : 7));
      this.camY += (camTarget - this.camY) * k;
      this.zoom += (zoomTarget - this.zoom) * k;
      this.anchor += (anchorTarget - this.anchor) * k;
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.drawSky(this.camY / SLAB_H);
    this.drawMarkers();

    // ---- falling pieces behind the tower ----
    this.stepFalling(paused ? 0 : dt);

    for (const piece of this.falling) {
      if (piece.x + piece.z < 0) this.drawFalling(piece);
    }

    // ---- tower ----
    const s = this.scale() * this.zoom;
    const visibleLevels = Math.ceil(this.height / (SLAB_H * s)) + 4;
    const first = Math.max(0, topLevel - visibleLevels);

    if (first === 0) {
      this.drawPedestal(sim.slabs[0]);
    }

    for (let i = Math.max(1, first); i <= topLevel; i++) {
      const slab = sim.slabs[i];
      this.drawSlab(slab.x, slab.z, slab.w, slab.d, slab.level * SLAB_H, slab.level, slab.tone, slab.perfect);
    }

    // ---- perfect flash on the top block ----
    if (this.flash > 0 && topLevel > 0) {
      const top = sim.slabs[topLevel];
      this.topFace(top.x, top.z, top.w, top.d, (top.level + 1) * SLAB_H);
      ctx.fillStyle = `rgba(255,236,170,${0.65 * this.flash})`;
      ctx.fill();
      this.flash = Math.max(0, this.flash - dt * 4);
    }

    // ---- moving block ----
    if (!sim.dead) {
      const block = sim.moving;
      const pos = sim.prevPos + ((block.axis === 0 ? block.x : block.z) - sim.prevPos) * alpha;
      const x = block.axis === 0 ? pos : block.x;
      const z = block.axis === 1 ? pos : block.z;
      this.drawSlab(x, z, block.w, block.d, block.level * SLAB_H, block.level, block.tone, false);
    }

    // ---- falling pieces in front ----
    for (const piece of this.falling) {
      if (piece.x + piece.z >= 0) this.drawFalling(piece);
    }

    // ---- rings ----
    for (const ring of this.rings) {
      ring.age += paused ? 0 : dt;
      const t = ring.age / 0.5;
      if (t >= 1) continue;
      const grow = 1 + t * 0.45;
      const slab = ring.slab;
      this.topFace(slab.x, slab.z, slab.w * grow, slab.d * grow, (slab.level + 1) * SLAB_H);
      ctx.strokeStyle = `rgba(255,216,110,${(1 - t) * 0.95})`;
      ctx.lineWidth = 2.5 * (1 - t) + 0.5;
      ctx.stroke();
    }

    this.rings = this.rings.filter((ring) => ring.age < 0.5);
  }

  // ---------------------------------------------------------
  // Sky
  // ---------------------------------------------------------

  private drawSky(
    level: number
  ) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const [top, middle, horizon] = skyAt(level);

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, rgb(top));
    gradient.addColorStop(0.55, rgb(middle));
    gradient.addColorStop(1, rgb(horizon));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Stars fade in from dusk to night.
    const starAlpha = clamp01((level - 10) / 30);

    if (starAlpha > 0) {
      for (const star of this.stars) {
        const twinkle = this.reducedMotion
          ? 0.8
          : 0.55 + 0.45 * Math.sin(this.time * 1.7 + star.phase);
        // Slow parallax drift as the camera rises.
        const y = (star.y * h + level * 1.2) % h;
        ctx.fillStyle = `rgba(255,244,214,${starAlpha * twinkle})`;
        ctx.beginPath();
        ctx.arc(star.x * w, y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Moon rises at night.
    const moonAlpha = clamp01((level - 18) / 20);

    if (moonAlpha > 0) {
      const mx = w * 0.78;
      const my = h * 0.16;
      const glow = ctx.createRadialGradient(mx, my, 4, mx, my, 70);
      glow.addColorStop(0, `rgba(255,236,190,${0.35 * moonAlpha})`);
      glow.addColorStop(1, "rgba(255,236,190,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(mx - 70, my - 70, 140, 140);
      ctx.fillStyle = `rgba(250,240,214,${0.9 * moonAlpha})`;
      ctx.beginPath();
      ctx.arc(mx, my, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgb(skyAt(level)[0], moonAlpha);
      ctx.beginPath();
      ctx.arc(mx + 6, my - 4, 13, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distant pyramids on the horizon, sinking away as you climb.
    const sink = level * SLAB_H * this.scale() * 0.22;
    const baseY = h * 0.9 + sink;

    if (baseY - h * 0.2 < h) {
      const far = mix(horizon, top, 0.55);
      ctx.fillStyle = rgb(far, 0.85);
      this.pyramid(w * 0.18, baseY, w * 0.2);
      this.pyramid(w * 0.86, baseY + 6, w * 0.15);
      ctx.fillStyle = rgb(mix(far, [0, 0, 0], 0.25), 0.9);
      this.pyramid(w * 0.34, baseY + 10, w * 0.12);
      // Dunes
      ctx.fillStyle = rgb(mix(horizon, [40, 20, 30], 0.55));
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      ctx.quadraticCurveTo(w * 0.3, baseY - 18, w * 0.6, baseY - 4);
      ctx.quadraticCurveTo(w * 0.85, baseY + 6, w, baseY - 8);
      ctx.lineTo(w, h + sink + 400);
      ctx.lineTo(0, h + sink + 400);
      ctx.closePath();
      ctx.fill();
    }
  }

  private pyramid(
    cx: number,
    baseY: number,
    half: number
  ) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(cx - half, baseY);
    ctx.lineTo(cx, baseY - half * 0.72);
    ctx.lineTo(cx + half, baseY);
    ctx.closePath();
    ctx.fill();
  }

  private drawMarkers() {
    const ctx = this.ctx;

    for (const marker of this.markers) {
      if (marker.score <= 0) continue;

      // Top surface of block #score, on the tower axis.
      const y = this.sy(0, (marker.score + 1) * SLAB_H, 0);

      if (y < -10 || y > this.height + 10) continue;

      const gold = marker.kind === "best";

      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = gold ? "rgba(255,216,110,.75)" : "rgba(170,190,255,.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = `700 10px ${this.fontBody}`;
      ctx.textBaseline = "bottom";
      ctx.textAlign = gold ? "left" : "right";
      ctx.fillStyle = gold ? "rgba(255,226,140,.95)" : "rgba(190,205,255,.85)";
      const text = `${marker.label} · ${marker.score}`;
      ctx.fillText(text, gold ? 10 : this.width - 10, y - 3);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------
  // Slabs
  // ---------------------------------------------------------

  private topFace(
    x: number,
    z: number,
    w: number,
    d: number,
    y: number
  ) {
    const ctx = this.ctx;
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;

    ctx.beginPath();
    ctx.moveTo(this.sx(x0, z0), this.sy(x0, y, z0));
    ctx.lineTo(this.sx(x1, z0), this.sy(x1, y, z0));
    ctx.lineTo(this.sx(x1, z1), this.sy(x1, y, z1));
    ctx.lineTo(this.sx(x0, z1), this.sy(x0, y, z1));
    ctx.closePath();
  }

  private drawPedestal(
    base: Slab
  ) {
    // The base block continues down as a big stepped plinth.
    const colour: Rgb = [150, 112, 72];
    this.drawBox(base.x, base.z, base.w + 20, base.d + 20, -PEDESTAL_DEPTH, PEDESTAL_DEPTH - 40, colour, null, false);
    this.drawBox(base.x, base.z, base.w + 10, base.d + 10, -40, 40, [176, 134, 86], null, false);
    this.drawBox(base.x, base.z, base.w, base.d, 0, SLAB_H, stoneColour(0, 3, this.phase), 0, false);
  }

  private drawSlab(
    x: number,
    z: number,
    w: number,
    d: number,
    y: number,
    level: number,
    tone: number,
    perfect: boolean
  ) {
    this.drawBox(x, z, w, d, y, SLAB_H, stoneColour(level, tone, this.phase), level, perfect);
  }

  private drawBox(
    x: number,
    z: number,
    w: number,
    d: number,
    y: number,
    h: number,
    colour: Rgb,
    glyphLevel: number | null,
    perfect: boolean,
    alpha = 1
  ) {
    const ctx = this.ctx;
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    const yTop = y + h;

    const right = mix(colour, [70, 40, 30], 0.32);
    const left = mix(colour, [40, 24, 34], 0.48);
    const top = mix(colour, [255, 246, 220], 0.12);

    // Right face (+x): B(x1,z0) -> C(x1,z1)
    ctx.beginPath();
    ctx.moveTo(this.sx(x1, z0), this.sy(x1, yTop, z0));
    ctx.lineTo(this.sx(x1, z1), this.sy(x1, yTop, z1));
    ctx.lineTo(this.sx(x1, z1), this.sy(x1, y, z1));
    ctx.lineTo(this.sx(x1, z0), this.sy(x1, y, z0));
    ctx.closePath();
    ctx.fillStyle = rgb(right, alpha);
    ctx.fill();

    // Left face (+z): D(x0,z1) -> C(x1,z1)
    ctx.beginPath();
    ctx.moveTo(this.sx(x0, z1), this.sy(x0, yTop, z1));
    ctx.lineTo(this.sx(x1, z1), this.sy(x1, yTop, z1));
    ctx.lineTo(this.sx(x1, z1), this.sy(x1, y, z1));
    ctx.lineTo(this.sx(x0, z1), this.sy(x0, y, z1));
    ctx.closePath();
    ctx.fillStyle = rgb(left, alpha);
    ctx.fill();

    // Top
    this.topFace(x, z, w, d, yTop);
    ctx.fillStyle = rgb(top, alpha);
    ctx.fill();

    // Crisp edges: light on the top rim, dark at the base joint.
    const s = this.scale() * this.zoom;
    ctx.lineWidth = Math.max(0.6, s * 0.7);
    ctx.strokeStyle = perfect
      ? `rgba(255,214,110,${0.85 * alpha})`
      : `rgba(255,240,205,${0.35 * alpha})`;
    ctx.beginPath();
    ctx.moveTo(this.sx(x0, z1), this.sy(x0, yTop, z1));
    ctx.lineTo(this.sx(x1, z1), this.sy(x1, yTop, z1));
    ctx.lineTo(this.sx(x1, z0), this.sy(x1, yTop, z0));
    ctx.stroke();

    ctx.strokeStyle = `rgba(30,16,10,${0.35 * alpha})`;
    ctx.lineWidth = Math.max(0.5, s * 0.5);
    ctx.beginPath();
    ctx.moveTo(this.sx(x0, z1), this.sy(x0, y, z1));
    ctx.lineTo(this.sx(x1, z1), this.sy(x1, y, z1));
    ctx.lineTo(this.sx(x1, z0), this.sy(x1, y, z0));
    ctx.stroke();

    if (
      glyphLevel !== null &&
      h * s > 9
    ) {
      // +z face: runs left -> right along x (screen right-down).
      if (w > 26) {
        this.glyph(
          GLYPHS[(glyphLevel * 3 + 1) % GLYPHS.length],
          this.sx(x, z1),
          this.sy(x, y + h / 2, z1),
          ISO_C * s,
          ISO_S * s,
          s,
          left,
          alpha
        );
      }

      // +x face: draw left -> right on screen = from C (z1) to B (z0).
      if (d > 26) {
        this.glyph(
          GLYPHS[(glyphLevel * 3 + 2) % GLYPHS.length],
          this.sx(x1, z),
          this.sy(x1, y + h / 2, z),
          ISO_C * s,
          -ISO_S * s,
          s,
          right,
          alpha
        );
      }
    }
  }

  /** Carved glyph on a side face: dark groove + light lower lip. */
  private glyph(
    path: GlyphPath,
    ex: number,
    ey: number,
    ax: number,
    ay: number,
    s: number,
    face: Rgb,
    alpha: number
  ) {
    const ctx = this.ctx;
    const unit = (SLAB_H * 0.62) / 16;

    ctx.save();
    ctx.setTransform(
      this.dpr * ax * unit,
      this.dpr * ay * unit,
      0,
      this.dpr * s * unit,
      this.dpr * ex,
      this.dpr * ey
    );
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Light lip just below the groove.
    ctx.translate(0, 0.9);
    path(ctx);
    ctx.strokeStyle = rgb(mix(face, [255, 240, 205], 0.45), 0.55 * alpha);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.translate(0, -0.9);
    path(ctx);
    ctx.strokeStyle = rgb(mix(face, [36, 18, 8], 0.6), 0.85 * alpha);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------
  // Falling pieces
  // ---------------------------------------------------------

  private stepFalling(
    dt: number
  ) {
    for (const piece of this.falling) {
      piece.age += dt;
      piece.vy -= 1500 * dt;
      piece.y += piece.vy * dt;
      piece.x += piece.vx * dt;
      piece.z += piece.vz * dt;
    }

    this.falling = this.falling.filter(
      (piece) => piece.age < 1.6
    );
  }

  private drawFalling(
    piece: FallingPiece
  ) {
    const alpha = clamp01(1 - (piece.age - 0.7) / 0.9);
    if (alpha <= 0) return;
    this.drawBox(piece.x, piece.z, piece.w, piece.d, piece.y, SLAB_H, stoneColour(piece.level, piece.tone, this.phase), piece.level, false, alpha);
  }
}
