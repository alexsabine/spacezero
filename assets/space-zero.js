/* ═══════════════════════════════════════════════════════════════════════════
 *  SPACE ZERO — Shared runtime
 *
 *  Loaded by every page via <script src="assets/space-zero.js" defer>.
 *  Exposes:
 *    SpaceZero.renderLogo(canvas, options)
 *    SpaceZero.renderWisdom(canvas)
 *    SpaceZero.renderAlign(canvas)
 *    SpaceZero.renderBenevolence(canvas)
 *    SpaceZero.renderAesthetics(canvas)
 *    SpaceZero.initStrapline(rootEl)
 *    SpaceZero.mountChrome(currentPage)  — injects header + footer
 *    SpaceZero.bootElements()            — auto-mounts any canvas[data-element]
 *
 *  Auto-boot: on DOMContentLoaded, mountChrome reads
 *  <body data-page="..."> to highlight the active nav link, then bootElements
 *  wires up any element canvases and auto-runs renderLogo on #heroLogo /
 *  #footerLogo / #miniLogo.
 *
 *  Living simulations — computational method: CRR (A. Sabine),
 *  temporalgrammar.ai. GUI uses peer-reviewed FEP / Active Inference and
 *  physical-process vocabulary only; CRR appears in §CRR code tags here.
 * ═════════════════════════════════════════════════════════════════════════ */

(function () {
'use strict';

const TAU = Math.PI * 2;
const PI  = Math.PI;
const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI  = 1 / PHI;
const INV_PHI2 = 1 / (PHI * PHI);
const THETA_C  = PI / 5;

const T_BREATH_BASE = 2 * PI * PI / PHI;
const T_DRIFT_BASE  = 2 * PI * PI;

const OMEGA_SHARP = 1 / (2 * PI);
const OMEGA_MID   = 1 / (PI * PHI);
const OMEGA_SOFT  = 1 / PI;

const PAL = {
  iceplantBright: [218, 100, 176],
  iceplantDeep:   [168,  70, 138],
  iceplantPale:   [240, 188, 216],
  skyBlue:        [ 96, 164, 210],
  redwoodBark:    [112,  58,  36],
  redwoodWarm:    [156,  92,  58],
  cinnamon:       [182, 116,  72],
  moss:           [ 98, 122,  72],
  fern:           [124, 148,  86],
  sage:           [156, 168, 132],
  amberCream:     [248, 216, 168],
  amberWarm:      [200, 145,  91],
  ember:          [216,  96,  52],
  parchment:      [244, 241, 235],
  parchmentWarm:  [237, 230, 212],
  ink:            [ 26,  22,  18],
  russet:         [176, 102,  60],
  waterCobalt:    [ 60, 155, 157],
  waterAqua:      [ 45, 140, 125],
  waterEmerald:   [ 75, 155, 130],
  waterJade:      [ 90, 170, 145],
  lichenOchre:    [200, 170, 115],
};

const rgba    = (c, a) => `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const blend   = (a, b, t) => [a[0]*(1-t)+b[0]*t, a[1]*(1-t)+b[1]*t, a[2]*(1-t)+b[2]*t];
const clamp01 = x => Math.max(0, Math.min(1, x));

/* ═══ FRAME SCHEDULER (visibility-aware) ═══ */
const _visible = new Set();
const _pending = new Map();
const _io = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          _visible.add(e.target);
          const kick = _pending.get(e.target);
          if (kick) { _pending.delete(e.target); kick(); }
        } else { _visible.delete(e.target); }
      }
    }, { rootMargin: '80px' })
  : null;

function scheduleNext(canvas, draw) {
  if ((!_io || _visible.has(canvas)) && !document.hidden) {
    requestAnimationFrame(draw);
  } else {
    _pending.set(canvas, () => requestAnimationFrame(draw));
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    for (const cv of _visible) {
      const kick = _pending.get(cv);
      if (kick) { _pending.delete(cv); kick(); }
    }
  }
});

function registerCanvas(canvas) {
  if (_io) { _visible.add(canvas); _io.observe(canvas); }
  else { _visible.add(canvas); }
}

function setupCanvas(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  /* Read the canvas's actual rendered size from CSS. If no stylesheet has
   * touched it yet (naked canvas, no rules matching), getBoundingClientRect
   * returns the HTML-attribute size. If CSS has sized it (max-width, width:
   * 100%, aspect-ratio etc.), we get that instead. Either way, we size the
   * drawing buffer to the actual display dimensions × DPR. Fall back to the
   * passed-in cssW/cssH if the canvas is hidden or not yet laid out. */
  const rect = canvas.getBoundingClientRect();
  const displayW = rect.width  > 0 ? rect.width  : cssW;
  const displayH = rect.height > 0 ? rect.height : cssH;

  canvas.width  = Math.round(displayW * dpr);
  canvas.height = Math.round(displayH * dpr);
  /* Intentionally do NOT set canvas.style.width/height — CSS already controls
   * the display size. Setting inline styles here would override responsive
   * rules and cause aspect-ratio mismatches on narrow viewports. */

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const off = document.createElement('canvas');
  off.width  = Math.round(displayW * dpr);
  off.height = Math.round(displayH * dpr);
  const offCtx = off.getContext('2d');
  offCtx.scale(dpr, dpr);
  return { ctx, offCtx, off, dpr, W: displayW, H: displayH };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  LOGO — Rough-paper watercolour, crescent + zero geometry
 * ═════════════════════════════════════════════════════════════════════════ */

const ROUGH_PAPER = {
  octaves: [{ f: 1.0, a: 0.35 }, { f: 2.2, a: 0.30 }, { f: 5.5, a: 0.20 }, { f: 12, a: 0.15 }],
  sigmaF: 0.22,
  kappa:  0.55,
  omegaDist: [OMEGA_MID,  OMEGA_SHARP, OMEGA_MID,  OMEGA_MID,
              OMEGA_SHARP, OMEGA_MID,  OMEGA_MID,  OMEGA_SHARP],
  paperAlpha: 0.16,
  wetEdgeAlpha: 0.10,
  tendrilLenScale: PHI,
  seed: 4141,
};

const LOGO_PATCHES_BASE = [
  { col: PAL.waterCobalt,    weight: 1.10, rSpread: 0.52, lobes: 3 },
  { col: PAL.waterAqua,      weight: 1.05, rSpread: 0.48, lobes: 3 },
  { col: PAL.waterEmerald,   weight: 0.95, rSpread: 0.50, lobes: 3 },
  { col: PAL.waterJade,      weight: 0.80, rSpread: 0.56, lobes: 2 },
  { col: PAL.iceplantBright, weight: 0.85, rSpread: 0.38, lobes: 3 },
  { col: PAL.iceplantPale,   weight: 0.75, rSpread: 0.46, lobes: 2 },
  { col: PAL.amberCream,     weight: 0.78, rSpread: 0.50, lobes: 2 },
  { col: PAL.lichenOchre,    weight: 0.70, rSpread: 0.42, lobes: 2 },
];
const LOGO_PATCHES = LOGO_PATCHES_BASE.map((p, i) => ({ ...p, omega: ROUGH_PAPER.omegaDist[i] }));

function logoGeom(W, H, scale) {
  const R   = Math.min(W, H) * scale;
  const rho = R * INV_PHI;
  const d   = R * INV_PHI2;
  const cosA = Math.cos(THETA_C);
  const sinA = Math.sin(THETA_C);
  const r   = Math.sqrt(R*R + d*d - 2*R*d*cosA);
  const x0  = rho;
  const logoMinX = -R;
  const logoMaxX = x0 + rho;
  const cx = W/2 - (logoMinX + logoMaxX) / 2;
  const cy = H/2;
  return {
    R, r, d, rho,
    cuspTheta: THETA_C, cuspX: R * cosA, yCusp: R * sinA,
    cx, cy,
    bayCx: cx + d, bayCy: cy,
    zeroCx: cx + x0, zeroCy: cy,
    zeroR: rho,
  };
}

function crescentInnerRadius(theta, g) {
  const ct = Math.cos(theta);
  const d = g.d, r_bay = g.r;
  const disc = d*d*ct*ct - d*d + r_bay*r_bay;
  if (disc < 0) return 0;
  const sq = Math.sqrt(disc);
  const t_near = d * ct - sq;
  const t_far  = d * ct + sq;
  if (t_near > 0) return Math.min(t_near, g.R);
  if (t_far  > 0) return Math.min(t_far,  g.R);
  return 0;
}

function renderCrescentBody(offCtx, W, H, g, drawContent) {
  offCtx.clearRect(0, 0, W, H);
  offCtx.save();
  offCtx.beginPath();
  offCtx.arc(g.cx, g.cy, g.R, 0, TAU);
  offCtx.clip();
  drawContent(offCtx, g);
  offCtx.globalCompositeOperation = 'destination-out';
  offCtx.beginPath();
  offCtx.arc(g.bayCx, g.bayCy, g.r, 0, TAU);
  offCtx.fill();
  offCtx.beginPath();
  offCtx.arc(g.zeroCx, g.zeroCy, g.zeroR, 0, TAU);
  offCtx.fill();
  offCtx.restore();
}

function strokeOuterArc(ctx, g, colour, width) {
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, g.R, g.cuspTheta, TAU - g.cuspTheta, false);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}

/* Multi-octave paper texture, cached per (W, H, seed) */
const _paperCache = new Map();
function getPaperTexture(W, H, paperSpec) {
  const key = `${W}x${H}:${paperSpec.seed}`;
  if (_paperCache.has(key)) return _paperCache.get(key);

  const lowScale = 3;
  const lowW = Math.ceil(W / lowScale);
  const lowH = Math.ceil(H / lowScale);
  let s = paperSpec.seed >>> 0;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const octaveFields = paperSpec.octaves.map(oct => {
    const gridW = Math.max(2, Math.ceil(lowW * oct.f / 20));
    const gridH = Math.max(2, Math.ceil(lowH * oct.f / 20));
    const grid = new Float32Array(gridW * gridH);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    return { grid, gridW, gridH, amp: oct.a };
  });
  const imgData = new ImageData(lowW, lowH);
  for (let y = 0; y < lowH; y++) {
    for (let x = 0; x < lowW; x++) {
      const u = x / lowW, v = y / lowH;
      let accum = 0, totalA = 0;
      for (const f of octaveFields) {
        const gx = u * (f.gridW - 1);
        const gy = v * (f.gridH - 1);
        const gx0 = Math.floor(gx), gx1 = Math.min(gx0 + 1, f.gridW - 1);
        const gy0 = Math.floor(gy), gy1 = Math.min(gy0 + 1, f.gridH - 1);
        const fx = gx - gx0, fy = gy - gy0;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const v00 = f.grid[gy0 * f.gridW + gx0];
        const v10 = f.grid[gy0 * f.gridW + gx1];
        const v01 = f.grid[gy1 * f.gridW + gx0];
        const v11 = f.grid[gy1 * f.gridW + gx1];
        const vx0 = v00 * (1 - sx) + v10 * sx;
        const vx1 = v01 * (1 - sx) + v11 * sx;
        accum  += (vx0 * (1 - sy) + vx1 * sy) * f.amp;
        totalA += f.amp;
      }
      const val = accum / totalA;
      const g = Math.floor(clamp01(0.5 + (val - 0.5) * (paperSpec.sigmaF * 4)) * 255);
      const idx = (y * lowW + x) * 4;
      imgData.data[idx] = g; imgData.data[idx+1] = g; imgData.data[idx+2] = g; imgData.data[idx+3] = 255;
    }
  }
  const lowCanvas = document.createElement('canvas');
  lowCanvas.width = lowW; lowCanvas.height = lowH;
  lowCanvas.getContext('2d').putImageData(imgData, 0, 0);
  const full = document.createElement('canvas');
  full.width = W; full.height = H;
  const fCtx = full.getContext('2d');
  fCtx.imageSmoothingEnabled = true;
  fCtx.imageSmoothingQuality = 'high';
  fCtx.drawImage(lowCanvas, 0, 0, W, H);
  const samples = new Uint8ClampedArray(lowW * lowH);
  const lowData = lowCanvas.getContext('2d').getImageData(0, 0, lowW, lowH).data;
  for (let i = 0; i < samples.length; i++) samples[i] = lowData[i * 4];
  const result = { canvas: full, lowW, lowH, samples };
  _paperCache.set(key, result);
  return result;
}

function paperGradient(paperTex, x, y, W, H) {
  const { samples, lowW, lowH } = paperTex;
  const u = clamp01(x / W), v = clamp01(y / H);
  const ix = Math.floor(u * (lowW - 1));
  const iy = Math.floor(v * (lowH - 1));
  const s = (i, j) => samples[
    Math.max(0, Math.min(lowH-1, iy + j)) * lowW +
    Math.max(0, Math.min(lowW-1, ix + i))
  ];
  return [(s(1,0) - s(-1,0)) / 255, (s(0,1) - s(0,-1)) / 255];
}

function buildLogoPatchStates(patches, t, g) {
  const backArcMin = g.cuspTheta;
  const backArcMax = TAU - g.cuspTheta;
  const arcSpan = backArcMax - backArcMin;
  const states = [];
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    const T_drift  = T_DRIFT_BASE  * (1 + 0.15 * Math.sin(i * 2.1));
    const T_breath = T_BREATH_BASE * (1 + 0.22 * Math.cos(i * 1.7));
    const phase0   = ((i * PHI) % 1) * TAU;
    const driftPhase = (t / T_drift) * TAU + phase0;
    const tremor    = (t / (T_drift * 0.31)) * TAU + phase0 * 1.3;
    const angBase  = backArcMin + ((i + 0.5) / patches.length) * arcSpan;
    const angSweep = 0.085 * arcSpan * Math.sin(driftPhase);
    const angTremor = 0.012 * arcSpan * Math.sin(tremor);
    let ang = angBase + angSweep + angTremor;
    while (ang < backArcMin) ang += arcSpan;
    while (ang > backArcMax) ang  = backArcMin + ((ang - backArcMin) % arcSpan);
    const rInner = crescentInnerRadius(ang, g);
    const rOuter = g.R * 0.97;
    const rMid   = (rInner + rOuter) * 0.5;
    const rHalf  = (rOuter - rInner) * 0.5;
    const rOsc   = rHalf * 0.10 * Math.sin(driftPhase * 0.6 + phase0 * 1.3);
    const r      = rMid + rOsc;
    const breathPh = (t * TAU / T_breath) + phase0;
    const bRaw = Math.cos(breathPh);
    const breath = 0.4 + 0.6 * bRaw * bRaw;
    const x = g.cx + Math.cos(ang) * r;
    const y = g.cy + Math.sin(ang) * r;
    const thicknessFrac = clamp01((rOuter - rInner) / (g.R * 0.65));
    const sigma = p.rSpread * g.R * (0.55 + 0.55 * thicknessFrac);
    const C = breath;
    const crrWeight = Math.exp(C / p.omega) / Math.exp(1 / p.omega);
    states.push({ x, y, sigma, col: p.col, ang,
      breath, crrWeight, baseWeight: p.weight, omega: p.omega,
      lobes: p.lobes, phase0 });
  }
  return states;
}

function drawZero(ctx, g, t, breath, withText) {
  const { zeroCx: cx, zeroCy: cy, zeroR: R } = g;
  const rimW = Math.max(1.3, R * 0.026);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.993, 0, TAU);
  ctx.fillStyle = rgba(PAL.parchment, 1.0);
  ctx.fill();
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.98);
  const glowAmt = 0.05 + 0.09 * breath;
  glow.addColorStop(0.00, rgba(PAL.amberCream, glowAmt));
  glow.addColorStop(0.55, rgba(PAL.amberCream, glowAmt * 0.35));
  glow.addColorStop(1.00, rgba(PAL.amberCream, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.strokeStyle = rgba(PAL.ink, 0.86);
  ctx.lineWidth = rimW;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.89, 0, TAU);
  ctx.strokeStyle = rgba(PAL.ink, 0.14);
  ctx.lineWidth = rimW * 0.36;
  ctx.stroke();
  const phaseAng = (t * TAU / 24) % TAU;
  const dotR = R * 0.058, orbit = R * 0.94;
  const dotX = cx + Math.cos(phaseAng - PI/2) * orbit;
  const dotY = cy + Math.sin(phaseAng - PI/2) * orbit;
  const flareR = dotR * 5.5;
  const dotGlow = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, flareR);
  dotGlow.addColorStop(0.00, rgba(PAL.amberCream, 0.60));
  dotGlow.addColorStop(0.40, rgba(PAL.russet,     0.24));
  dotGlow.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = dotGlow;
  ctx.fillRect(dotX - flareR, dotY - flareR, flareR * 2, flareR * 2);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.97, 0, TAU);
  ctx.clip();
  ctx.save();
  ctx.translate(dotX, dotY);
  ctx.rotate(Math.atan2(cy - dotY, cx - dotX));
  const innerBeamLen = R * 2.1, innerBeamHalf = 0.13;
  const innerGrad = ctx.createLinearGradient(0, 0, innerBeamLen, 0);
  innerGrad.addColorStop(0.00, rgba(PAL.amberCream, 0.22));
  innerGrad.addColorStop(0.30, rgba(PAL.amberCream, 0.10));
  innerGrad.addColorStop(0.70, rgba(PAL.amberCream, 0.025));
  innerGrad.addColorStop(1.00, rgba(PAL.amberCream, 0));
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, innerBeamLen, -innerBeamHalf, innerBeamHalf);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotR, 0, TAU);
  ctx.fillStyle = rgba(PAL.russet, 0.92);
  ctx.fill();
  if (withText) {
    const fontSize = R * 0.39;
    const lineOffset = fontSize * 0.56;
    ctx.save();
    ctx.font = `500 italic ${fontSize}px "Cormorant Garamond", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(PAL.ink, 0.95);
    ctx.fillText('Space', cx, cy - lineOffset);
    ctx.fillText('Zero',  cx, cy + lineOffset);
    ctx.restore();
  }
}

function renderLogo(canvas, options) {
  options = options || {};
  const cssW = parseInt(canvas.getAttribute('width'));
  const cssH = parseInt(canvas.getAttribute('height'));
  const { ctx, offCtx, off, dpr, W, H } = setupCanvas(canvas, cssW, cssH);
  const scale = options.scale || 0.30;
  const withText = options.withText !== false;
  const g = logoGeom(W, H, scale);
  const paperTex = getPaperTexture(W * dpr, H * dpr, ROUGH_PAPER);
  const memory = LOGO_PATCHES.map(() => ({
    flowX: 0, flowY: 0, sigma: 0, initialised: false,
  }));
  let t0 = performance.now() / 1000;
  let tPrev = 0;

  function draw(now) {
    const t = (now / 1000) - t0;
    let dt = t - tPrev;
    tPrev = t;
    if (!isFinite(dt) || dt < 0 || dt > 0.25) dt = 1/60;

    const bRaw = Math.cos(PI * t / (2 * PI * PI));
    const breathGlobal = 0.4 + 0.6 * bRaw * bRaw;
    const states = buildLogoPatchStates(LOGO_PATCHES, t, g);

    ctx.clearRect(0, 0, W, H);

    const halo = ctx.createRadialGradient(g.cx, g.cy, g.R * 0.5, g.cx, g.cy, g.R * 2.1);
    halo.addColorStop(0.00, rgba(PAL.waterJade, 0.024 * (0.7 + 0.5 * breathGlobal)));
    halo.addColorStop(0.55, rgba(PAL.waterJade, 0.006));
    halo.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    renderCrescentBody(offCtx, W, H, g, (c) => {
      c.fillStyle = rgba(PAL.parchmentWarm, 1.0);
      c.fillRect(g.cx - g.R - 4, g.cy - g.R - 4, g.R * 2.5, g.R * 2.5);

      const TAU_BASE = 0.55;
      const OMEGA_REF = OMEGA_MID;

      for (let si = 0; si < states.length; si++) {
        const s = states[si];
        const mem = memory[si];
        let repelX = 0, repelY = 0;
        const softRadius = s.sigma * 0.5;
        const soft2 = softRadius * softRadius;
        for (let oj = 0; oj < states.length; oj++) {
          if (oj === si) continue;
          const other = states[oj];
          const dx = s.x - other.x;
          const dy = s.y - other.y;
          const d2 = dx*dx + dy*dy + soft2;
          const w = other.crrWeight * other.breath / d2;
          repelX += dx * w; repelY += dy * w;
        }
        const rMag = Math.hypot(repelX, repelY) + 1e-6;
        repelX /= rMag; repelY /= rMag;
        const [pgx, pgy] = paperGradient(paperTex, s.x, s.y, W, H);
        const pgMag = Math.hypot(pgx, pgy) + 1e-6;
        let fxRaw = repelX + ROUGH_PAPER.kappa * pgx / pgMag;
        let fyRaw = repelY + ROUGH_PAPER.kappa * pgy / pgMag;
        const fMag = Math.hypot(fxRaw, fyRaw) + 1e-6;
        fxRaw /= fMag; fyRaw /= fMag;
        const tau = TAU_BASE * (s.omega / OMEGA_REF);
        const alpha = 1 - Math.exp(-dt / tau);
        if (!mem.initialised) {
          mem.flowX = fxRaw; mem.flowY = fyRaw;
          mem.sigma = s.sigma; mem.initialised = true;
        } else {
          mem.flowX += (fxRaw - mem.flowX) * alpha;
          mem.flowY += (fyRaw - mem.flowY) * alpha;
          mem.sigma += (s.sigma - mem.sigma) * alpha;
        }
      }

      for (let si = 0; si < states.length; si++) {
        const s = states[si]; const mem = memory[si];
        const baseAlpha = 0.32;
        const a = baseAlpha * s.baseWeight * (0.45 + 0.55 * s.crrWeight) * s.breath;
        if (a < 0.015) continue;
        const sig = mem.sigma;
        const grad = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, sig);
        grad.addColorStop(0.00, rgba(s.col, a));
        grad.addColorStop(0.22, rgba(s.col, a * 0.88));
        grad.addColorStop(0.48, rgba(s.col, a * 0.62));
        grad.addColorStop(0.76, rgba(s.col, a * 0.28));
        grad.addColorStop(1.00, rgba(s.col, 0));
        c.fillStyle = grad;
        c.fillRect(s.x - sig, s.y - sig, sig * 2, sig * 2);
      }

      for (let si = 0; si < states.length; si++) {
        const s = states[si]; const mem = memory[si];
        const mMag = Math.hypot(mem.flowX, mem.flowY) + 1e-6;
        const flowX = mem.flowX / mMag, flowY = mem.flowY / mMag;
        const flowAng = Math.atan2(flowY, flowX);
        const sigmaSmooth = mem.sigma;
        const L0 = PHI * sigmaSmooth * s.breath * ROUGH_PAPER.tendrilLenScale * 0.45;
        for (let k = 0; k < s.lobes; k++) {
          const fanOffset = (k - (s.lobes - 1) / 2) * 0.55;
          const L_k = L0 * (0.85 + 0.25 * Math.cos(k * 1.7 + s.phase0));
          const ang_k = flowAng + fanOffset;
          const tx = s.x + Math.cos(ang_k) * L_k;
          const ty = s.y + Math.sin(ang_k) * L_k;
          const tSigma = sigmaSmooth * (0.52 + 0.10 * Math.cos(k + s.phase0));
          const tA = 0.32 * s.baseWeight * (0.45 + 0.55 * s.crrWeight) * s.breath * 0.62;
          if (tA < 0.012) continue;
          const grad = c.createRadialGradient(tx, ty, 0, tx, ty, tSigma);
          grad.addColorStop(0.00, rgba(s.col, tA));
          grad.addColorStop(0.30, rgba(s.col, tA * 0.80));
          grad.addColorStop(0.65, rgba(s.col, tA * 0.38));
          grad.addColorStop(1.00, rgba(s.col, 0));
          c.fillStyle = grad;
          c.fillRect(tx - tSigma, ty - tSigma, tSigma * 2, tSigma * 2);
        }
      }

      for (let si = 0; si < states.length; si++) {
        const s = states[si];
        if (s.omega > OMEGA_SHARP * 1.1) continue;
        const edgeAlpha = ROUGH_PAPER.wetEdgeAlpha * s.breath * s.crrWeight;
        if (edgeAlpha < 0.008) continue;
        const sig = memory[si].sigma;
        const edgeR0 = sig * 0.60, edgeR1 = sig * 0.82;
        const edge = c.createRadialGradient(s.x, s.y, edgeR0, s.x, s.y, edgeR1);
        edge.addColorStop(0.00, rgba(s.col, 0));
        edge.addColorStop(0.50, rgba(s.col, edgeAlpha));
        edge.addColorStop(1.00, rgba(s.col, 0));
        c.fillStyle = edge;
        c.fillRect(s.x - edgeR1, s.y - edgeR1, edgeR1 * 2, edgeR1 * 2);
      }

      c.save();
      c.globalCompositeOperation = 'multiply';
      c.globalAlpha = ROUGH_PAPER.paperAlpha;
      c.drawImage(paperTex.canvas, 0, 0, W, H);
      c.restore();

      const edge = c.createRadialGradient(
        g.bayCx, g.bayCy, g.r * 0.96,
        g.bayCx, g.bayCy, g.r * 1.25);
      edge.addColorStop(0.00, rgba(PAL.redwoodBark, 0.18));
      edge.addColorStop(0.55, rgba(PAL.redwoodBark, 0.06));
      edge.addColorStop(1.00, 'rgba(0,0,0,0)');
      c.fillStyle = edge;
      c.fillRect(g.cx - g.R - 10, g.cy - g.R - 10, g.R * 2.6, g.R * 2.6);
    });
    ctx.drawImage(off, 0, 0, W, H);
    strokeOuterArc(ctx, g, rgba(PAL.ink, 0.32), Math.max(0.7, g.R * 0.006));
    drawZero(ctx, g, t, breathGlobal, withText);
    scheduleNext(canvas, draw);
  }
  registerCanvas(canvas);
  requestAnimationFrame(draw);
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  STRAPLINE — phase-shifting words
 * ═════════════════════════════════════════════════════════════════════════ */
function initStrapline(root) {
  root = root || document.getElementById('strapline');
  if (!root) return;
  const words = root.querySelectorAll('.strapline-word');
  if (!words.length) return;
  const T = 2 * PI * PI * 1.8;
  const phases = [0, TAU / 3, 2 * TAU / 3];

  function frame() {
    const now = performance.now() / 1000;
    words.forEach((el, i) => {
      const ph = (now / T) * TAU + phases[i];
      const c = Math.cos(ph);
      const envelope = c > 0 ? c * c : 0;
      const opacity = 0.48 + 0.52 * envelope;
      const drift = -1.5 * envelope;
      const warmth = envelope * 0.4;
      const r = Math.round(26 + warmth * (200 - 26) * 0.15);
      const g = Math.round(22 + warmth * (145 - 22) * 0.15);
      const b = Math.round(18 + warmth * ( 91 - 18) * 0.15);
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = `translateY(${drift.toFixed(2)}px)`;
      el.style.color = `rgb(${r},${g},${b})`;
    });
    if (!document.hidden) requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestAnimationFrame(frame);
  });
  requestAnimationFrame(frame);
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  ELEMENT RENDERERS
 * ═════════════════════════════════════════════════════════════════════════ */

/* ── 01 WISDOM: redwood cross-section, smooth annual growth ──
 *  §CRR engine: each annual ring is one coherence-accumulation cycle,
 *  C(t)=∫L dτ across the season; the latewood boundary is the rupture
 *  δ(now) that closes the year. Ω = OMEGA_SOFT (Z₂). Growth is therefore
 *  continuous (the cambium edge advances every frame) and the dark season
 *  line lands as a discrete event, exactly as in a real tree. Public
 *  framing: the slow outward growth of a redwood, ring by ring. */
function renderWisdom(canvas) {
  const cssW = parseInt(canvas.getAttribute('width'));
  const cssH = parseInt(canvas.getAttribute('height'));
  const { ctx, W, H } = setupCanvas(canvas, cssW, cssH);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const paperTex = getPaperTexture(cssW * dpr, cssH * dpr, ROUGH_PAPER);

  /* disc geometry — centred in the panel, pith offset up-and-right (as photo) */
  const Rdisc   = Math.min(W, H) * 0.455;
  const barkW   = Rdisc * 0.060;
  const woodR   = Rdisc - barkW;
  const discX   = W * 0.5,  discY = H * 0.5;
  const pithX   = discX + woodR * 0.135;
  const pithY   = discY - woodR * 0.155;
  const R0      = woodR * 0.045;                 // pith radius
  const N_MAT   = 15;                            // rings at maturity
  const baseW   = (woodR - R0) / N_MAT;

  /* eccentric nested-ring centre: pith near the middle, outer rings settle
   * onto the disc centre — gives the natural off-centre heartwood look */
  function ringCentre(r) {
    const q = clamp01(r / woodR);
    const e = q * q;                             // ease toward disc centre
    return [pithX + (discX - pithX) * e, pithY + (discY - pithY) * e];
  }

  /* §CRR climate forcing → ring-width modulation (vigour ≈ coherence gain) */
  function climate(y) {
    return 1.0
      + 0.20 * Math.sin(TAU * y / 4.1 + 1.3)     // ENSO
      + 0.14 * Math.sin(TAU * y / 11.3 + 0.4)    // solar
      + 0.08 * Math.sin(TAU * y / 22.7 + 2.1)    // decadal
      + 0.04 * Math.sin(TAU * y / 2.3 + 5.7);    // micro
  }
  function warpFor(y) {
    const warp = [];
    let s = (y * 7919 + 13) >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s >>> 0) / 4294967296; };
    for (let h = 2; h <= 6; h++) warp.push({ k: h, amp: (rnd() - 0.5) * (0.035 / h), phase: rnd() * TAU });
    return warp;
  }
  function ringWidth(y, cRecent) {
    const clim  = climate(y);
    const Ccur  = Math.min(PI * 0.7, cRecent);
    const regen = Math.exp((Ccur - PI / 2) / OMEGA_SOFT) / Math.exp((PI / 2) / OMEGA_SOFT);
    return { w: clim * (0.5 + 0.5 * regen) * baseW, clim };
  }

  /* growth state — the disc grows from a sapling and regenerates in a loop */
  let phase, alpha, growthR, year, cRecent, curInner, curClim, plannedOuter, holdT;
  let rings, warp;
  const YEAR = 2.05;                             // seconds per ring
  function reset() {
    phase = 'grow'; alpha = 0; holdT = 0;
    growthR = R0; year = 0; cRecent = 1.0;
    curInner = R0; rings = []; warp = warpFor(0);
    const rw = ringWidth(0, cRecent); curClim = rw.clim;
    plannedOuter = Math.min(R0 + rw.w, woodR);
  }
  reset();

  /* draw one ring boundary polyline at radius r with its warp */
  function ringPath(r, wp) {
    const [cxr, cyr] = ringCentre(r);
    ctx.beginPath();
    const seg = 96;
    for (let k = 0; k <= seg; k++) {
      const ang = (k / seg) * TAU;
      let rr = r;
      for (const h of wp) rr += woodR * h.amp * Math.cos(h.k * ang + h.phase);
      const x = cxr + Math.cos(ang) * rr;
      const y = cyr + Math.sin(ang) * rr;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  let t0 = performance.now() / 1000, tPrev = 0;

  function draw(now) {
    const t = (now / 1000) - t0;
    let dt = t - tPrev; tPrev = t;
    if (!isFinite(dt) || dt < 0 || dt > 0.25) dt = 1 / 60;

    const bRaw = Math.cos(PI * t / (2 * PI * PI));
    const breath = 0.4 + 0.6 * bRaw * bRaw;

    /* ── growth state machine ── */
    if (phase === 'grow') {
      alpha = Math.min(1, alpha + dt * 1.4);
      const speed = (plannedOuter - curInner) / YEAR;     // smooth cambium advance
      growthR = Math.min(plannedOuter, growthR + speed * dt);
      if (growthR >= plannedOuter - 1e-4) {
        // close the year: latewood line = rupture δ
        rings.push({ inner: curInner, outer: plannedOuter, warp, clim: curClim });
        curInner = plannedOuter; year++;
        cRecent = cRecent * (1 - 1 / 5) + curClim * (1 / 5);
        if (plannedOuter >= woodR - 1e-3 || year >= N_MAT + 2) {
          phase = 'hold'; holdT = 0;
        } else {
          warp = warpFor(year);
          const rw = ringWidth(year, cRecent); curClim = rw.clim;
          plannedOuter = Math.min(curInner + rw.w, woodR);
        }
      }
    } else if (phase === 'hold') {
      holdT += dt; if (holdT > 4.0) phase = 'fadeout';
    } else if (phase === 'fadeout') {
      alpha = Math.max(0, alpha - dt * 0.5);
      if (alpha <= 0.001) reset();
    }

    /* ── background: light parchment, faint warm centre ── */
    ctx.clearRect(0, 0, W, H);
    const bgWarm = ctx.createRadialGradient(discX, discY, 0, discX, discY, Rdisc * 1.5);
    bgWarm.addColorStop(0.00, rgba(PAL.parchmentWarm, 1.0));
    bgWarm.addColorStop(0.60, rgba(PAL.parchment, 1.0));
    bgWarm.addColorStop(1.00, rgba(PAL.parchmentWarm, 1.0));
    ctx.fillStyle = bgWarm;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.10;
    ctx.drawImage(paperTex.canvas, 0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;

    /* ── disc body (sapwood) clipped to current growth edge ── */
    ctx.save();
    ringPath(growthR, warp);
    ctx.clip();
    const body = ctx.createRadialGradient(pithX, pithY, R0 * 0.4, pithX, pithY, woodR);
    body.addColorStop(0.00, rgba(blend(PAL.redwoodWarm, PAL.cinnamon, 0.4), 1.0));
    body.addColorStop(0.30, rgba(blend(PAL.cinnamon, PAL.amberCream, 0.30), 1.0));
    body.addColorStop(0.72, rgba(blend(PAL.cinnamon, PAL.amberCream, 0.42), 1.0));
    body.addColorStop(1.00, rgba(blend(PAL.cinnamon, PAL.amberWarm, 0.30), 1.0));
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, W, H);

    /* completed rings: earlywood fill + crisp latewood line + fine sub-lines */
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      // latewood boundary (the rupture line)
      ringPath(r.outer, r.warp);
      const dark = 0.30 + 0.16 * (1 - r.clim * 0.5);
      ctx.strokeStyle = rgba(blend(PAL.redwoodBark, PAL.cinnamon, 0.35), dark);
      ctx.lineWidth = Math.max(0.9, 1.5 - r.clim * 0.3);
      ctx.stroke();
      // a couple of faint earlywood sub-rings for grain density
      const span = r.outer - r.inner;
      for (let q = 1; q <= 2; q++) {
        const rr = r.inner + span * (q / 3);
        ringPath(rr, r.warp);
        ctx.strokeStyle = rgba(blend(PAL.cinnamon, PAL.redwoodBark, 0.25), 0.10);
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    /* current (growing) ring — soft earlywood, no hard outer line yet */
    if (phase === 'grow') {
      ringPath(growthR, warp);
      ctx.strokeStyle = rgba(blend(PAL.amberCream, PAL.cinnamon, 0.4), 0.16);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    /* medullary rays — faint radial grain from pith outward */
    const rays = 9;
    for (let ri = 0; ri < rays; ri++) {
      const a0 = (ri / rays) * TAU + 0.3 * Math.sin(ri * 2.1);
      ctx.beginPath();
      const segR = 26;
      for (let k = 0; k <= segR; k++) {
        const tt = k / segR;
        const rad = R0 * 0.8 + (growthR - R0 * 0.8) * tt;
        const [cxr, cyr] = ringCentre(rad);
        const a = a0 + (3 * Math.sin(rad * 0.12 + ri * 3)) / Math.max(rad, 1);
        const x = cxr + Math.cos(a) * rad;
        const y = cyr + Math.sin(a) * rad;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(PAL.redwoodBark, 0.085);
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    ctx.restore(); // unclip disc body

    /* ── heartwood / pith ── */
    const core = ctx.createRadialGradient(pithX, pithY, 0, pithX, pithY, R0 * 2.2);
    core.addColorStop(0.00, rgba(PAL.redwoodBark, 0.78));
    core.addColorStop(0.45, rgba(PAL.redwoodBark, 0.34));
    core.addColorStop(1.00, rgba(PAL.redwoodBark, 0));
    ctx.fillStyle = core;
    ctx.fillRect(pithX - R0 * 2.4, pithY - R0 * 2.4, R0 * 4.8, R0 * 4.8);

    /* ── latewood-boundary glow: the freshly closed year (rupture trace) ── */
    if (phase === 'grow' && rings.length) {
      const last = rings[rings.length - 1];
      const ageSec = (growthR - last.outer) / Math.max((plannedOuter - curInner), 1) * YEAR;
      const g = Math.max(0, 1 - ageSec / 0.7);
      if (g > 0.02) {
        ringPath(last.outer, last.warp);
        ctx.strokeStyle = rgba(PAL.amberCream, 0.30 * g);
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
    }

    /* ── bark: rough dark rim at the live cambium edge ── */
    const [bcx, bcy] = ringCentre(growthR);
    const seg = 150;
    let sB = 9173 >>> 0;
    const rndB = () => { sB = (sB * 1664525 + 1013904223) >>> 0; return (sB >>> 0) / 4294967296; };
    ctx.beginPath();
    for (let k = 0; k <= seg; k++) {
      const ang = (k / seg) * TAU;
      let rr = growthR;
      for (const h of warp) rr += woodR * h.amp * Math.cos(h.k * ang + h.phase);
      const x = bcx + Math.cos(ang) * rr;
      const y = bcy + Math.sin(ang) * rr;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    sB = 9173 >>> 0;
    for (let k = seg; k >= 0; k--) {
      const ang = (k / seg) * TAU;
      let rr = growthR + barkW * (0.55 + 0.85 * rndB());     // ragged outer edge
      for (const h of warp) rr += woodR * h.amp * Math.cos(h.k * ang + h.phase);
      const x = bcx + Math.cos(ang) * rr;
      const y = bcy + Math.sin(ang) * rr;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    const barkGrad = ctx.createRadialGradient(bcx, bcy, growthR * 0.96, bcx, bcy, growthR + barkW);
    barkGrad.addColorStop(0.0, rgba(blend(PAL.redwoodBark, PAL.cinnamon, 0.2), 0.95));
    barkGrad.addColorStop(0.5, rgba(PAL.redwoodBark, 0.92));
    barkGrad.addColorStop(1.0, rgba(PAL.ink, 0.80));
    ctx.fillStyle = barkGrad;
    ctx.fill('evenodd');

    // bark inner contour
    ringPath(growthR, warp);
    ctx.strokeStyle = rgba(PAL.ink, 0.30 + 0.05 * breath);
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.restore(); // alpha

    scheduleNext(canvas, draw);
  }
  registerCanvas(canvas);
  requestAnimationFrame(draw);
}

/* ── 02 ALIGN: iridescent fish school ──
 *  §CRR engine: each fish carries a coherence accumulator (Ω = 0.8); local
 *  flocking drives C(t), and when C·Ω saturates the fish ruptures (scatters)
 *  then regenerates toward its coherence-weighted validated heading. Schools
 *  therefore split and re-form without any global controller. Dynamics ported
 *  verbatim from the Active Inference school (temporalgrammar.ai); rendering
 *  adds thin-film iridescence and an underwater field. Public framing: a
 *  school aligning through nearest-neighbour attention. */
function renderAlign(canvas) {
  const cssW = parseInt(canvas.getAttribute('width'));
  const cssH = parseInt(canvas.getAttribute('height'));
  const { ctx, W, H } = setupCanvas(canvas, cssW, cssH);
  const X = ctx;
  const P = PI, T = TAU;
  const { sin, cos, sqrt, min, max, abs, atan2, pow, exp, floor, round, hypot } = Math;
  const R = Math.random;
  let t = 0;

  /* ── predator: a click/tap acts as a threat the school flees from ── */
  const threat = { x: 0, y: 0, s: 0 };
  const ripples = [];
  function localPt(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / (r.width || W)), y: (e.clientY - r.top) * (H / (r.height || H)) };
  }
  canvas.addEventListener('pointerdown', (e) => {
    const p = localPt(e);
    threat.x = p.x; threat.y = p.y; threat.s = 1;
    ripples.push({ x: p.x, y: p.y, age: 0 });
    if (ripples.length > 4) ripples.shift();
  });

  /* ── spatial hash ── */
  const CELL = max(40, min(W, H) * 0.2);
  let hashW, hashH, grid = [], hashDirty = true;
  function rebuildHash() { hashW = Math.ceil(W / CELL) + 1; hashH = Math.ceil(H / CELL) + 1; grid = new Array(hashW * hashH); for (let i = 0; i < grid.length; i++) grid[i] = []; hashDirty = false; }
  function clearHash() { for (let i = 0; i < grid.length; i++) grid[i].length = 0; }
  function insertHash(f) { const cx = floor(f.x / CELL), cy = floor(f.y / CELL); if (cx >= 0 && cx < hashW && cy >= 0 && cy < hashH) grid[cx + cy * hashW].push(f); }
  function queryHash(x, y, r) { const res = []; const x0 = max(0, floor((x - r) / CELL)), x1 = min(hashW - 1, floor((x + r) / CELL)); const y0 = max(0, floor((y - r) / CELL)), y1 = min(hashH - 1, floor((y + r) / CELL)); for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const cl = grid[cx + cy * hashW]; for (let i = 0; i < cl.length; i++) res.push(cl[i]); } return res; }

  /* ── §CRR engine (Ω = 0.8) ── */
  const Wom = 0.8;
  class FishCRR {
    constructor() { this.C = R() * 2; this.Cmax = 1 / Wom; this.ruptured = false; this.ruptures = 0; this.regen = 0; this.headingHist = []; }
    step(L, dt, currentAng) {
      this.ruptured = false; this.C += L * dt; this.C *= pow(.97, dt); this.C = max(0, min(this.C, this.Cmax * 2));
      if (this.ruptures % 3 === 0 || this.headingHist.length < 20) { this.headingHist.push({ ang: currentAng, c: this.C }); if (this.headingHist.length > 40) this.headingHist.shift(); }
      if (this.C >= this.Cmax * (1 + (R() - .5) * Wom)) { this.ruptured = true; this.ruptures++; this.C *= .35; this.regen = .3; }
      if (this.regen > 0) this.regen = max(0, this.regen - dt); return this;
    }
    get w() { return exp(min(this.C / Wom, 4)); }
    get validatedHeading() { if (this.headingHist.length === 0) return null; let best = null, bestW = 0; for (const h of this.headingHist) { const w = exp(h.c / Wom); if (w > bestW) { bestW = w; best = h; } } return best; }
  }
  class TailCRR {
    constructor(w, cv) { this.w = w; this.cv = cv; this.C = R() / w * .5; this.st = 0; this.rt = 0; this.a = 0; this.sa = 0; this.ph = 0; }
    step(L, dt) {
      if (this.st === 0) { this.C += L * dt; this.ph += dt * L; if (this.C >= (1 / this.w) * (1 + (R() - .5) * 2 * this.cv)) { this.st = 1; this.a = 1; } }
      else if (this.st === 1) { this.st = 2; this.rt = 0; }
      else { this.rt += dt; if (this.rt > .04) { this.st = 0; this.C = 0; } }
      this.sa += (this.a - this.sa) * min(1, dt * 14); this.a *= pow(.015, dt);
    }
  }

  /* ── fish ── */
  const N = 40, fishes = [];
  for (let i = 0; i < N; i++) {
    const hBase = 168 + R() * 46, hShift = (R() - .5) * 18, depth = R();
    fishes.push({
      x: 0, y: 0, vx: (R() - .5) * 30, vy: (R() - .5) * 30, ang: R() * T,
      crr: new FishCRR(), tail: new TailCRR(Wom / P, 1 / T),
      gill: new TailCRR(Wom / T, 1 / (4 * P)), pect: new TailCRR(Wom / T, 1 / (4 * P)),
      fp: R() * T, len: 0,
      h: hBase + hShift, s: 56 + R() * 20, l: 50 + R() * 20,
      id: i, depth, swimSpeed: 1.5 + R() * .6,
    });
  }
  (function initFishes() {
    const L = min(W, H) * 0.062, cx = W * .5, cy = H * .5;
    for (let i = 0; i < N; i++) { const f = fishes[i], a = R() * T, r = R() * min(W, H) * .22; f.x = cx + cos(a) * r; f.y = cy + sin(a) * r; f.len = L * (.6 + f.depth * .5) * (.9 + R() * .2); f.ang = a + P * .5 + (R() - .5) * .5; }
  })();

  /* ── physics ── */
  const FLOCK_R = min(W, H) * 0.2, SEP_R = min(W, H) * 0.062, MAX_SPEED = 3.0;
  const MARGIN = min(W, H) * 0.14;
  function upd(dt) {
    if (hashDirty) rebuildHash(); clearHash();
    for (const f of fishes) insertHash(f);
    // slow drifting attractor so the school keeps re-centring in frame (§CRR SO(2) drift)
    const ax = W * (0.5 + 0.16 * sin(t * 0.11)), ay = H * (0.5 + 0.12 * sin(t * 0.09 + 1.7));
    if (threat.s > 0) threat.s = max(0, threat.s - dt / 1.5);   // decays over ~1.5s
    const threatR = min(W, H) * 0.42;
    for (const f of fishes) {
      const tL = 8 + sin(t * .3 + f.id * .1) * .8;
      f.tail.step(tL, dt); f.fp += dt * (5 + f.tail.sa * 20);
      f.gill.step(4.5, dt); f.pect.step(2, dt);
      const near = queryHash(f.x, f.y, FLOCK_R);
      let sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0, nc = 0;
      for (let j = 0; j < near.length; j++) {
        const o = near[j]; if (o === f) continue;
        const dx = o.x - f.x, dy = o.y - f.y, d = hypot(dx, dy); if (d > FLOCK_R || d < .1) continue;
        if (d < SEP_R) { const rep = (SEP_R - d) / SEP_R; sepX -= dx / d * rep; sepY -= dy / d * rep; }
        aliX += o.vx; aliY += o.vy; cohX += o.x; cohY += o.y; nc++;
      }
      if (nc > 0) { aliX /= nc; aliY /= nc; aliX -= f.vx; aliY -= f.vy; cohX /= nc; cohY /= nc; cohX -= f.x; cohY -= f.y; }
      const aliMag = hypot(aliX, aliY), cohMag = hypot(cohX, cohY);
      const L_flock = aliMag * .12 + cohMag * .003 + .1;
      f.crr.step(L_flock, dt, f.ang);
      const w = f.crr.w;
      f.vx += sepX * .18 + aliX * .07 * w + cohX * .004 * w;
      f.vy += sepY * .18 + aliY * .07 * w + cohY * .004 * w;
      if (f.crr.ruptured) { const jitter = (R() - .5) * .8; f.vx += cos(f.ang + P * .5) * jitter * 2; f.vy += sin(f.ang + P * .5) * jitter * 2; }
      if (f.crr.regen > 0) { const vh = f.crr.validatedHeading; if (vh) { const bl = f.crr.regen * .15 * dt * 60; f.vx += (cos(vh.ang) * f.swimSpeed - f.vx) * bl; f.vy += (sin(vh.ang) * f.swimSpeed - f.vy) * bl; } }
      // predator threat: strong repulsion + coherence disruption → the school scatters
      if (threat.s > 0) {
        const mdx = threat.x - f.x, mdy = threat.y - f.y, md = hypot(mdx, mdy) + 1;
        if (md < threatR) {
          const fall = (1 - md / threatR) * threat.s;
          f.vx -= mdx / md * fall * 3.4; f.vy -= mdy / md * fall * 3.4;
          if (md < threatR * 0.55) f.crr.C *= pow(0.86, dt * 60);   // disrupt coherence near the strike
        }
      }
      // gentle centring + soft edge containment (replaces toroidal wrap)
      f.vx += (ax - f.x) * 0.00045; f.vy += (ay - f.y) * 0.00045;
      if (f.x < MARGIN) f.vx += (MARGIN - f.x) / MARGIN * 0.6;
      else if (f.x > W - MARGIN) f.vx -= (f.x - (W - MARGIN)) / MARGIN * 0.6;
      if (f.y < MARGIN) f.vy += (MARGIN - f.y) / MARGIN * 0.6;
      else if (f.y > H - MARGIN) f.vy -= (f.y - (H - MARGIN)) / MARGIN * 0.6;
      if (R() < .01) { f.vx += (R() - .5) * .3; f.vy += (R() - .5) * .3; }
      const spd = hypot(f.vx, f.vy);
      if (spd < f.swimSpeed * .5) { f.vx += cos(f.ang) * f.swimSpeed * .3 * dt * 60; f.vy += sin(f.ang) * f.swimSpeed * .3 * dt * 60; }
      const spd2 = hypot(f.vx, f.vy);
      if (spd2 > MAX_SPEED) { f.vx *= MAX_SPEED / spd2; f.vy *= MAX_SPEED / spd2; }
      f.vx *= pow(.985, dt * 60); f.vy *= pow(.985, dt * 60);
    }
    // spacing resolution
    for (const f of fishes) {
      const near = queryHash(f.x, f.y, f.len * .5);
      for (const o of near) { if (o === f) continue; const dx = o.x - f.x, dy = o.y - f.y, d = hypot(dx, dy) + .1; const minD = (f.len + o.len) * .2; if (d < minD) { const push = (minD - d) / minD * 2, nx2 = dx / d, ny2 = dy / d; f.vx -= nx2 * push; f.vy -= ny2 * push; o.vx += nx2 * push; o.vy += ny2 * push; f.x -= nx2 * push * .5; f.y -= ny2 * push * .5; o.x += nx2 * push * .5; o.y += ny2 * push * .5; } }
    }
    for (const f of fishes) {
      f.x += f.vx * dt * 60; f.y += f.vy * dt * 60;
      const spd = hypot(f.vx, f.vy);
      if (spd > .3) { let da = atan2(f.vy, f.vx) - f.ang; while (da > P) da -= T; while (da < -P) da += T; f.ang += da * min(1, dt * 8); }
      const m = f.len; // hard clamp safety
      f.x = max(-m, min(W + m, f.x)); f.y = max(-m, min(H + m, f.y));
    }
  }

  /* ── draw helpers ── */
  function bP(f, s, side) {
    const L = f.len;
    const wave = sin(f.fp - s * 3.2) * L * (.01 + s * s * (.04 + f.tail.sa * .1));
    const pr = [0, .055, .09, .11, .115, .11, .1, .085, .06, .035, .012];
    const idx = s * (pr.length - 1), lo = floor(idx), hi = min(lo + 1, pr.length - 1);
    const hw = L * (pr[lo] * (1 - (idx - lo)) + pr[hi] * (idx - lo));
    const bx = (.42 - s) * L, by = wave + side * hw;
    return { x: f.x + cos(f.ang) * bx - sin(f.ang) * by, y: f.y + sin(f.ang) * bx + cos(f.ang) * by };
  }
  const NG = 1.83;
  function tF(th, a) {
    const l = 2 * NG * th * cos(a); let r = 0, g = 0, b = 0;
    if (l >= 380 && l < 440) { r = (440 - l) / 60; b = 1; } else if (l >= 440 && l < 490) { g = (l - 440) / 50; b = 1; }
    else if (l >= 490 && l < 510) { g = 1; b = (510 - l) / 20; } else if (l >= 510 && l < 580) { r = (l - 510) / 70; g = 1; }
    else if (l >= 580 && l < 645) { r = 1; g = (645 - l) / 65; } else if (l >= 645 && l <= 780) { r = 1; }
    let f2 = 1; if (l >= 380 && l < 420) f2 = .3 + .7 * (l - 380) / 40; else if (l > 700) f2 = max(0, .3 + .7 * (780 - l) / 80); else if (l < 380 || l > 780) f2 = 0;
    return { r: r * f2, g: g * f2, b: b * f2 };
  }

  function drawFish(f) {
    const L = f.len, ca = cos(f.ang), sa2 = sin(f.ang), nx = -sa2, ny = ca;
    const dp = f.depth, depthAlpha = .65 + dp * .35;
    X.save(); X.globalAlpha = depthAlpha;
    X.save(); X.globalAlpha = .04 * depthAlpha;
    X.beginPath(); X.ellipse(f.x + 3, f.y + L * .06, L * .3, L * .035, f.ang, 0, T); X.fillStyle = '#000'; X.fill(); X.restore();
    // tail fin
    const tb = bP(f, .88, 0), tt = bP(f, 1, 0);
    X.save(); X.globalAlpha = .5;
    const tA = f.ang + P, tpx = cos(tA), tpy = sin(tA), sp = L * .14, tl = L * .12;
    X.beginPath(); X.moveTo(tb.x, tb.y);
    X.bezierCurveTo(tt.x + tpx * tl * .3 + nx * sp * .6, tt.y + tpy * tl * .3 + ny * sp * .6, tt.x + tpx * tl + nx * sp, tt.y + tpy * tl + ny * sp, tt.x + tpx * tl * .5, tt.y + tpy * tl * .5);
    X.lineTo(tt.x, tt.y); X.lineTo(tt.x + tpx * tl * .5, tt.y + tpy * tl * .5);
    X.bezierCurveTo(tt.x + tpx * tl - nx * sp, tt.y + tpy * tl - ny * sp, tt.x + tpx * tl * .3 - nx * sp * .6, tt.y + tpy * tl * .3 - ny * sp * .6, tb.x, tb.y);
    const tg = X.createLinearGradient(tt.x + nx * sp, tt.y + ny * sp, tt.x - nx * sp, tt.y - ny * sp);
    tg.addColorStop(0, `hsla(${f.h + 8},${f.s - 12}%,${f.l - 5}%,.35)`); tg.addColorStop(.5, `hsla(${f.h},${f.s}%,${f.l + 5}%,.5)`); tg.addColorStop(1, `hsla(${f.h + 8},${f.s - 12}%,${f.l - 5}%,.35)`);
    X.fillStyle = tg; X.fill();
    if (dp > .3) { X.strokeStyle = `hsla(${f.h},${f.s - 20}%,${f.l + 10}%,.12)`; X.lineWidth = .4; for (let i = 0; i < 7; i++) { const sv = (i / 6) * 2 - 1; X.beginPath(); X.moveTo(tb.x, tb.y); X.quadraticCurveTo(tt.x + tpx * tl * .3 + nx * sv * sp * .3, tt.y + tpy * tl * .3 + ny * sv * sp * .3, tt.x + tpx * tl * .7 + nx * sv * sp * .85, tt.y + tpy * tl * .7 + ny * sv * sp * .85); X.stroke(); } }
    X.restore();
    // dorsal
    if (dp > .25) { const d1 = bP(f, .22, -1), d2 = bP(f, .52, -1), dH = L * .1 + sin(t * 1.3 + f.id) * .003 * L; X.save(); X.globalAlpha = .4; X.beginPath(); X.moveTo(d1.x, d1.y); X.bezierCurveTo(d1.x + nx * dH * .4, d1.y + ny * dH * .4, (d1.x + d2.x) / 2 + nx * dH, (d1.y + d2.y) / 2 + ny * dH, d2.x, d2.y); const dg = X.createLinearGradient(d1.x + nx * dH, d1.y + ny * dH, d1.x, d1.y); dg.addColorStop(0, `hsla(${f.h},${f.s - 10}%,${f.l - 5}%,.12)`); dg.addColorStop(1, `hsla(${f.h + 5},${f.s - 5}%,${f.l}%,.35)`); X.fillStyle = dg; X.fill(); X.restore(); }
    // anal
    if (dp > .3) { const a1 = bP(f, .52, 1), a2 = bP(f, .7, 1); X.save(); X.globalAlpha = .3; X.beginPath(); X.moveTo(a1.x, a1.y); X.quadraticCurveTo((a1.x + a2.x) / 2 - nx * L * .06, (a1.y + a2.y) / 2 - ny * L * .06, a2.x, a2.y); X.fillStyle = `hsla(${f.h + 5},${f.s - 12}%,${f.l - 3}%,.3)`; X.fill(); X.restore(); }
    // body
    const bStep = dp > .5 ? .012 : .025;
    X.beginPath();
    for (let s = 0; s <= 1; s += bStep) { const p = bP(f, s, -1); s === 0 ? X.moveTo(p.x, p.y) : X.lineTo(p.x, p.y); }
    for (let s = 1; s >= 0; s -= bStep) { const p = bP(f, s, 1); X.lineTo(p.x, p.y); }
    X.closePath(); X.save(); X.clip();
    const bg = X.createLinearGradient(f.x + nx * L * .13, f.y + ny * L * .13, f.x - nx * L * .13, f.y - ny * L * .13);
    bg.addColorStop(0, `hsla(${f.h - 5},${f.s + 5}%,${max(25, f.l - 12)}%,.9)`);
    bg.addColorStop(.2, `hsla(${f.h + 10},${f.s + 16}%,${min(90, f.l + 14)}%,.93)`);
    bg.addColorStop(.42, `hsla(${f.h + 18},${f.s + 6}%,${min(93, f.l + 22)}%,.91)`);
    bg.addColorStop(.6, `hsla(${f.h + 5},${f.s + 2}%,${min(90, f.l + 15)}%,.91)`);
    bg.addColorStop(.8, `hsla(${f.h},${f.s}%,${min(88, f.l + 8)}%,.9)`);
    bg.addColorStop(1, `hsla(${f.h + 15},${f.s - 5}%,${min(95, f.l + 25)}%,.88)`);
    X.fillStyle = bg; X.fill();
    // iridescence
    const sR = L * .009;
    const spd = hypot(f.vx, f.vy);
    const ir = sin(t * 2.8 + f.id * 1.3) * .55 + .5;
    const ir2 = cos(t * 2.1 + f.id * .9 + spd * .3) * .35 + .5;
    const ir3 = sin(t * 3.8 + f.id * 2.5 + f.ang) * .25 + .5;
    const rows = dp > .65 ? 12 : dp > .3 ? 7 : 4, cols = dp > .65 ? 24 : dp > .3 ? 14 : 8;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const s = (col + .5) / cols, v = (row + .5) / rows, side = v < .5 ? -1 : 1, vF = abs(v - .5) * 2;
      const sO = s + (row % 2) * .021; if (sO > 1) continue;
      const p = bP(f, sO, side * vF);
      const th = vF * P * .5 + sin(t * 1.6 + sO * 7 + f.id * 1.7) * .18 + ir * .1 + ir2 * .07 + ir3 * .04 + spd * .02;
      const tk = 75 + sin(sO * 28 + row * 3.5 + f.h * .18) * 35 + sin(t * 3.2 + col * .7 + row * .9) * 10 + ir3 * 5;
      const cl = tF(tk, th);
      const dorsalB = max(0, 1 - vF * 1.5) * .12;
      const inten = .11 + .26 * (1 - vF) + dorsalB + f.tail.sa * .1 + ir2 * .04 + ir3 * .03;
      X.fillStyle = `rgba(${round(cl.r * 255)},${round(cl.g * 255)},${round(cl.b * 255)},${inten})`;
      X.beginPath(); X.arc(p.x, p.y, sR * (.85 + vF * .3), -P * .7, P * .7); X.fill();
    }
    if (dp > .4) {
      const sh = sin(t * 3.5 + f.id * 2.3 + f.x * .02) * .12 + .035 + spd * .01;
      if (sh > .01) { const sp2 = bP(f, .12, -.12), sp3 = bP(f, .58, -.06); X.beginPath(); X.moveTo(sp2.x, sp2.y); X.quadraticCurveTo((sp2.x + sp3.x) / 2 + nx * L * .012, (sp2.y + sp3.y) / 2 + ny * L * .012, sp3.x, sp3.y); X.lineWidth = L * .016; X.strokeStyle = `rgba(255,255,255,${sh})`; X.stroke(); }
    }
    // lateral line
    X.beginPath();
    for (let s = .05; s < .88; s += .007) { const p = bP(f, s, 0); s < .06 ? X.moveTo(p.x, p.y) : X.lineTo(p.x, p.y); }
    X.strokeStyle = `hsla(${f.h + 30},30%,80%,.14)`; X.lineWidth = .7; X.stroke();
    X.restore();
    // gills
    if (dp > .4) { const go = .25 + f.gill.sa * .45 + sin(f.gill.ph * 3) * .06, gp = bP(f, .16, .25); X.save(); X.globalAlpha = .3; for (let i = 0; i < 3; i++) { X.beginPath(); X.moveTo(gp.x + ca * i * L * .008, gp.y + sa2 * i * L * .008); X.lineTo(gp.x + ca * i * L * .008 - nx * L * .01 * go, gp.y + sa2 * i * L * .008 - ny * L * .01 * go); X.strokeStyle = `rgba(${155 + i * 20},${45 + i * 10},${35 + i * 10},${.1 + go * .12})`; X.lineWidth = 1.2; X.stroke(); } X.restore(); }
    // pectoral
    if (dp > .35) { const pa = sin(f.pect.ph * 2.5) * .3 + f.pect.sa * .15, pp = bP(f, .2, .55); X.save(); X.globalAlpha = .25; X.translate(pp.x, pp.y); X.rotate(f.ang + P * .3 + pa); X.beginPath(); X.moveTo(0, 0); X.bezierCurveTo(-L * .01, L * .035, -L * .05, L * .06, -L * .07, L * .048); X.bezierCurveTo(-L * .055, L * .02, -L * .02, L * .005, 0, 0); const pfg = X.createLinearGradient(0, 0, -L * .06, L * .05); pfg.addColorStop(0, `hsla(${f.h},${f.s - 15}%,${f.l + 5}%,.4)`); pfg.addColorStop(1, `hsla(${f.h + 10},${f.s - 20}%,${f.l + 10}%,.1)`); X.fillStyle = pfg; X.fill(); X.restore(); }
    // eye
    const ep = bP(f, .07, -.14), eR = L * .017;
    X.beginPath(); X.arc(ep.x, ep.y, eR, 0, T);
    const eg = X.createRadialGradient(ep.x - eR * .1, ep.y - eR * .1, 0, ep.x, ep.y, eR);
    eg.addColorStop(0, '#e8e4d8'); eg.addColorStop(.8, '#d0ccc0'); eg.addColorStop(1, '#a09888'); X.fillStyle = eg; X.fill();
    X.beginPath(); X.arc(ep.x + eR * .1, ep.y, eR * .55, 0, T);
    const ig2 = X.createRadialGradient(ep.x + eR * .1, ep.y, eR * .08, ep.x + eR * .1, ep.y, eR * .55);
    ig2.addColorStop(0, '#806830'); ig2.addColorStop(.5, '#503815'); ig2.addColorStop(1, '#201005'); X.fillStyle = ig2; X.fill();
    X.beginPath(); X.arc(ep.x + eR * .14, ep.y, eR * .25, 0, T); X.fillStyle = '#080404'; X.fill();
    X.beginPath(); X.arc(ep.x + eR * .25, ep.y - eR * .18, eR * .1, 0, T); X.fillStyle = 'rgba(255,255,255,.5)'; X.fill();
    X.restore();
  }

  /* ── underwater field ── */
  function drawWater() {
    const bg = X.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0.00, rgba(blend(PAL.waterJade, PAL.amberCream, 0.30), 1.0));
    bg.addColorStop(0.30, rgba(PAL.waterEmerald, 1.0));
    bg.addColorStop(0.66, rgba(PAL.waterAqua, 1.0));
    bg.addColorStop(1.00, rgba(blend(PAL.waterCobalt, PAL.ink, 0.45), 1.0));
    X.fillStyle = bg; X.fillRect(0, 0, W, H);
    // god-rays from upper-left
    X.save(); X.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      const bx = W * (0.12 + i * 0.2) + sin(t * 0.12 + i) * W * 0.03;
      const wdt = W * (0.05 + 0.02 * sin(t * 0.2 + i * 1.3));
      const a = 0.05 + 0.03 * (0.5 + 0.5 * sin(t * 0.3 + i * 2));
      const g = X.createLinearGradient(bx, 0, bx + W * 0.12, H);
      g.addColorStop(0, rgba(PAL.amberCream, a));
      g.addColorStop(1, rgba(PAL.waterJade, 0));
      X.fillStyle = g;
      X.beginPath(); X.moveTo(bx - wdt, 0); X.lineTo(bx + wdt, 0); X.lineTo(bx + W * 0.12 + wdt * 2, H); X.lineTo(bx + W * 0.12 - wdt * 2, H); X.closePath(); X.fill();
    }
    // caustic net
    X.globalAlpha = 0.10;
    X.strokeStyle = rgba(PAL.amberCream, 1);
    X.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      X.beginPath();
      for (let xx = 0; xx <= W; xx += 12) {
        const yy = (i / 7) * H + sin(xx * 0.02 + t * 0.5 + i) * 10 + cos(xx * 0.05 - t * 0.3) * 6;
        xx === 0 ? X.moveTo(xx, yy) : X.lineTo(xx, yy);
      }
      X.stroke();
    }
    X.restore();
    // motes
    X.save(); X.globalCompositeOperation = 'screen';
    for (let i = 0; i < 26; i++) {
      const mx = ((i * 97 + t * 6) % W);
      const my = (H - ((i * 53 + t * 9) % H));
      const r = 0.8 + (i % 3) * 0.7;
      X.fillStyle = rgba(PAL.amberCream, 0.10 + 0.06 * sin(t + i));
      X.beginPath(); X.arc(mx, my, r, 0, T); X.fill();
    }
    X.restore();
  }

  let t0 = performance.now() / 1000, tPrev = 0;
  function draw(now) {
    t = (now / 1000) - t0;
    let dt = t - tPrev; tPrev = t;
    if (!isFinite(dt) || dt < 0 || dt > 0.1) dt = 1 / 60;
    drawWater();
    upd(dt);
    fishes.sort((a, b) => a.depth - b.depth);
    for (const f of fishes) drawFish(f);
    // predator-strike ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i]; rp.age += dt;
      const life = 1 - rp.age / 1.4;
      if (life <= 0) { ripples.splice(i, 1); continue; }
      const rad = (min(W, H) * 0.06) + rp.age * min(W, H) * 0.28;
      X.beginPath(); X.arc(rp.x, rp.y, rad, 0, T);
      X.strokeStyle = rgba(PAL.parchment, 0.22 * life);
      X.lineWidth = 1.4 * life + 0.3;
      X.stroke();
    }
    // gentle depth vignette
    const vg = X.createRadialGradient(W / 2, H / 2, min(W, H) * 0.3, W / 2, H / 2, max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, rgba(blend(PAL.waterCobalt, PAL.ink, 0.5), 0.45));
    X.fillStyle = vg; X.fillRect(0, 0, W, H);
    scheduleNext(canvas, draw);
  }
  registerCanvas(canvas);
  requestAnimationFrame(draw);
}

/* ── 03 BENEVOLENCE: the kept heartbeat ──
 *  §CRR engine. The cardiac cycle is the canonical coherence → rupture →
 *  regeneration loop, run on one boundary parameter Ω (sharp — a steady,
 *  kept rhythm):
 *    · Diastole — the ventricle fills; coherence accumulates, C = ∫L dτ.
 *    · Systole  — the QRS spike is the rupture δ(now), fired when C·Ω = 1;
 *                 the heart contracts (the visible beat) and the R wave breaks,
 *                 sending one pulse-ring outward.
 *    · T wave   — repolarisation is the regeneration kernel R = ∫φ·exp(C/Ω)·Θ;
 *                 the muscle recovers and the next filling begins.
 *  Respiratory sinus arrhythmia (real physiology) lets a slow breath gently
 *  modulate the beat period — depth ∝ Ω — so the rhythm lives rather than
 *  ticks. The PQRST trace is the same cycle read out as an instrument: the
 *  wave form of the heart, for medicine and living science. Public framing:
 *  kindness as the steady pulse beneath the work; technology with a heartbeat. */
function renderBenevolence(canvas) {
  const cssW = parseInt(canvas.getAttribute('width'));
  const cssH = parseInt(canvas.getAttribute('height'));
  const { ctx, W, H } = setupCanvas(canvas, cssW, cssH);
  const { sin, cos, exp, min, max, floor } = Math;

  /* §CRR boundary parameter — small Ω → a crisp, kept rhythm */
  const OM = OMEGA_SHARP;
  const RSA = 0.07 * (OM / OMEGA_MID);      // breath-driven period variability ∝ Ω
  const BASE_PERIOD = 1.05;                 // resting cycle ≈ 57 bpm, calm and steady

  /* ── PQRST morphology: the cardiac cycle as a function of beat-phase u∈[0,1),
   *    built from Gaussian lobes. R (the rupture) dominates; P precedes it
   *    (atrial), T follows (regeneration). Baseline sits at 0. */
  function gauss(u, c, a, w) { const d = u - c; return a * exp(-(d * d) / (2 * w * w)); }
  function ecg(u) {
    return gauss(u, 0.160, 0.11, 0.0200)    // P  — atrial depolarisation
         + gauss(u, 0.235, -0.07, 0.0080)   // Q
         + gauss(u, 0.258, 1.05, 0.0075)    // R  — the rupture δ
         + gauss(u, 0.288, -0.20, 0.0100)   // S
         + gauss(u, 0.430, 0.28, 0.0280);   // T  — regeneration kernel
  }
  /* the visible contraction: lub–dub, locked to QRS + early systole */
  function beatPulse(u) {
    return gauss(u, 0.258, 1.0, 0.026) + 0.5 * gauss(u, 0.360, 1.0, 0.032);
  }

  /* ── heart outline: classic parametric curve (beautiful, not anatomical) ── */
  const HN = 220, heartPts = [];
  for (let i = 0; i <= HN; i++) {
    const th = (i / HN) * TAU, s = sin(th);
    const x = 16 * s * s * s;
    const y = 13 * cos(th) - 5 * cos(2 * th) - 2 * cos(3 * th) - cos(4 * th);
    heartPts.push([x, -y]);                 // negate y → canvas (point downward)
  }
  let hMinX = 1e9, hMaxX = -1e9, hMinY = 1e9, hMaxY = -1e9;
  for (const [x, y] of heartPts) { hMinX = min(hMinX, x); hMaxX = max(hMaxX, x); hMinY = min(hMinY, y); hMaxY = max(hMaxY, y); }
  const hCX = (hMinX + hMaxX) / 2, hCY = (hMinY + hMaxY) / 2, hSpanY = hMaxY - hMinY;

  function heartPath(c, cx, cy, halfH, squash) {
    const s = (2 * halfH) / hSpanY;
    c.beginPath();
    for (let i = 0; i <= HN; i++) {
      const px = cx + (heartPts[i][0] - hCX) * s * (1 + squash);
      const py = cy + (heartPts[i][1] - hCY) * s * (1 - squash * 0.5);
      i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.closePath();
  }

  /* expanding heart-rings spawned at each rupture (the pulse radiating outward) */
  const rings = [];
  let beatPhase = 0, lastBeatIdx = -1;

  let t0 = performance.now() / 1000, tPrev = 0;

  function draw(now) {
    const t = (now / 1000) - t0;
    let dt = t - tPrev; tPrev = t;
    if (!isFinite(dt) || dt < 0 || dt > 0.1) dt = 1 / 60;

    /* breath (slow) → respiratory sinus arrhythmia: gently varies the period */
    const breath = 0.5 + 0.5 * cos(t * TAU / 8.0);            // 0..1, ~8 s
    const period = BASE_PERIOD * (1 + RSA * (breath - 0.5) * 2);
    beatPhase += dt / period;
    const u = beatPhase % 1;
    const beatIdx = floor(beatPhase);
    if (beatIdx !== lastBeatIdx) {                            // rupture δ → new ring
      lastBeatIdx = beatIdx;
      rings.push({ age: 0 });
      if (rings.length > 4) rings.shift();
    }
    const pulse = min(1, beatPulse(u));                       // contraction envelope
    const ev = ecg(u);                                        // live trace value

    /* layout */
    const heartCX = W * 0.50, heartCY = H * 0.385;
    const heartHalf = H * 0.180 * (1 + 0.085 * pulse);        // the visible beat
    const squash = 0.05 * pulse;                              // slight systolic squeeze
    const ecgY = H * 0.760, ecgAmp = H * 0.125;

    /* ── background: warm luminous wash ── */
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0.00, rgba(blend(PAL.parchmentWarm, PAL.iceplantPale, 0.10), 1));
    bg.addColorStop(0.45, rgba(blend(PAL.parchment, PAL.iceplantPale, 0.14), 1));
    bg.addColorStop(1.00, rgba(blend(PAL.parchmentWarm, PAL.amberWarm, 0.10), 1));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* radial warmth behind the heart, pulsing with the beat (feeling radiating) */
    {
      const gr = H * (0.42 + 0.10 * pulse);
      const rw = ctx.createRadialGradient(heartCX, heartCY, 0, heartCX, heartCY, gr);
      rw.addColorStop(0.0, rgba(blend(PAL.iceplantPale, PAL.amberCream, 0.5), 0.18 + 0.16 * pulse));
      rw.addColorStop(0.5, rgba(PAL.iceplantPale, 0.06 + 0.06 * pulse));
      rw.addColorStop(1.0, rgba(PAL.iceplantPale, 0));
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = rw; ctx.fillRect(heartCX - gr, heartCY - gr, gr * 2, gr * 2);
      ctx.restore();
    }

    /* ── faint monitor grid in the lower band (medicine / instrument) ── */
    {
      const gridTop = H * 0.58, gap = H * 0.045;
      ctx.save();
      ctx.strokeStyle = rgba(PAL.russet, 0.05);
      ctx.lineWidth = 1;
      for (let gy = gridTop; gy <= H; gy += gap) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
      for (let gx = 0; gx <= W; gx += gap) { ctx.beginPath(); ctx.moveTo(gx, gridTop); ctx.lineTo(gx, H); ctx.stroke(); }
      ctx.restore();
    }

    /* ── expanding heart-rings (pulse radiating outward) ── */
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const r of rings) {
      r.age = min(1, r.age + dt / 1.6);
      const e = r.age, a = (1 - e) * 0.22;
      if (a <= 0.002) continue;
      const col = blend(PAL.iceplantBright, PAL.ember, e * 0.5);
      heartPath(ctx, heartCX, heartCY, heartHalf * (1 + e * 1.25), squash * (1 - e));
      ctx.strokeStyle = rgba(col, a);
      ctx.lineWidth = 2.4 * (1 - e) + 0.4;
      ctx.stroke();
    }
    ctx.restore();

    /* ── heart glow bloom (screen) ── */
    {
      const gr = heartHalf * (1.7 + 0.5 * pulse);
      const gcol = blend(PAL.iceplantBright, PAL.ember, 0.25 + 0.3 * pulse);
      const hb = ctx.createRadialGradient(heartCX, heartCY, 0, heartCX, heartCY, gr);
      hb.addColorStop(0.0, rgba(gcol, 0.28 + 0.30 * pulse));
      hb.addColorStop(0.5, rgba(gcol, 0.10 + 0.12 * pulse));
      hb.addColorStop(1.0, rgba(gcol, 0));
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = hb; ctx.fillRect(heartCX - gr, heartCY - gr, gr * 2, gr * 2);
      ctx.restore();
    }

    /* ── heart body: soft watercolour gradient, rose → warm ── */
    const hTop = heartCY - heartHalf, hBot = heartCY + heartHalf;
    heartPath(ctx, heartCX, heartCY, heartHalf, squash);
    ctx.save();
    ctx.clip();
    const body = ctx.createLinearGradient(0, hTop, 0, hBot);
    body.addColorStop(0.00, rgba(blend(PAL.iceplantPale, PAL.amberCream, 0.35), 0.95));
    body.addColorStop(0.35, rgba(PAL.iceplantBright, 0.95));
    body.addColorStop(0.72, rgba(blend(PAL.iceplantDeep, PAL.iceplantBright, 0.4), 0.95));
    body.addColorStop(1.00, rgba(blend(PAL.iceplantDeep, PAL.ember, 0.35), 0.96));
    ctx.fillStyle = body;
    ctx.fillRect(heartCX - W, hTop, W * 2, hBot - hTop);

    // upper-left specular sheen (gentle dimensionality)
    const sx = heartCX - heartHalf * 0.45, sy = heartCY - heartHalf * 0.50;
    const sh = ctx.createRadialGradient(sx, sy, 0, sx, sy, heartHalf * 0.9);
    sh.addColorStop(0, rgba(PAL.parchment, 0.45));
    sh.addColorStop(1, rgba(PAL.parchment, 0));
    ctx.fillStyle = sh;
    ctx.fillRect(heartCX - W, hTop, W * 2, hBot - hTop);

    // faint inner contour lines for watercolour depth
    for (let k = 1; k <= 2; k++) {
      heartPath(ctx, heartCX, heartCY, heartHalf * (1 - k * 0.16), squash);
      ctx.strokeStyle = rgba(blend(PAL.iceplantDeep, PAL.parchment, 0.3), 0.10);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore(); // unclip

    // crisp warm rim
    heartPath(ctx, heartCX, heartCY, heartHalf, squash);
    ctx.strokeStyle = rgba(blend(PAL.iceplantDeep, PAL.ember, 0.3), 0.45);
    ctx.lineWidth = max(1, H * 0.004);
    ctx.stroke();

    /* ── ECG trace: the same cycle read out as an instrument ── */
    const xLead = W * 0.94, pxPerBeat = W / 2.2;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    let started = false;
    for (let xx = 0; xx <= W; xx += 1) {
      const ph = beatPhase - (xLead - xx) / pxPerBeat;
      const uu = ph - floor(ph);
      const yy = ecgY - ecg(uu) * ecgAmp;
      if (!started) { ctx.moveTo(xx, yy); started = true; } else ctx.lineTo(xx, yy);
    }
    // soft glow underlay
    ctx.strokeStyle = rgba(PAL.ember, 0.16);
    ctx.lineWidth = max(3, H * 0.014);
    ctx.stroke();
    // crisp line, fading toward the older (left) side
    const lineGrad = ctx.createLinearGradient(0, 0, W, 0);
    lineGrad.addColorStop(0.00, rgba(blend(PAL.ember, PAL.iceplantDeep, 0.3), 0.06));
    lineGrad.addColorStop(0.50, rgba(blend(PAL.ember, PAL.iceplantDeep, 0.2), 0.50));
    lineGrad.addColorStop(0.92, rgba(PAL.ember, 0.95));
    lineGrad.addColorStop(1.00, rgba(PAL.ember, 0.95));
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = max(1.4, H * 0.0065);
    ctx.stroke();
    ctx.restore();

    // leading pulse dot (the live "now"), flares on the R spike
    {
      const yLead = ecgY - ev * ecgAmp;
      const flare = max(pulse, ev > 0.5 ? ev : 0);
      const dr = (H * 0.012) * (1 + 1.6 * flare);
      const dg = ctx.createRadialGradient(xLead, yLead, 0, xLead, yLead, dr * 4);
      dg.addColorStop(0.0, rgba(PAL.amberCream, 0.9));
      dg.addColorStop(0.4, rgba(PAL.ember, 0.4 + 0.4 * flare));
      dg.addColorStop(1.0, rgba(PAL.ember, 0));
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = dg; ctx.fillRect(xLead - dr * 4, yLead - dr * 4, dr * 8, dr * 8);
      ctx.restore();
      ctx.beginPath(); ctx.arc(xLead, yLead, dr, 0, TAU);
      ctx.fillStyle = rgba(PAL.parchment, 0.95); ctx.fill();
    }

    /* gentle edge vignette to seat the scene */
    const vg = ctx.createRadialGradient(W / 2, H / 2, min(W, H) * 0.34, W / 2, H / 2, max(W, H) * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, rgba(PAL.ink, 0.20));
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    scheduleNext(canvas, draw);
  }
  registerCanvas(canvas);
  requestAnimationFrame(draw);
}

/* ── 04 AESTHETICS: sunset on the open water ──
 *  §CRR engine drives the whole scene through a single parameter Ω.
 *  · The sea is an SO(2) swell field: sin(k·x − ω·t) summation with
 *    Stokes harmonics — each cycle a complete C→δ→R event (phase
 *    accumulates, wraps at 2π, resets).
 *  · Whitecaps appear where slope·Ω ≥ 1 (the C·Ω = 1 rupture
 *    evaluated directly on the wave height field).
 *  · The sun descends slowly through the cycle; warmth dominates as
 *    altitude → 0. exp(−α·d) along the broken sun-path is the
 *    regeneration kernel, evaluated as scattered glitter on water.
 *  · Crest highlights catch the sunset light; foam is warm-lit.
 *  Public framing: light and water meeting at the close of day; the
 *  rhythm of return that neuroaesthetics recognises as beauty. */
function renderAesthetics(canvas) {
  const cssW = parseInt(canvas.getAttribute('width'));
  const cssH = parseInt(canvas.getAttribute('height'));
  const { ctx, W, H } = setupCanvas(canvas, cssW, cssH);
  const { sin, cos, abs, min, max, pow } = Math;

  /* §CRR boundary parameter — governs amplitude, whitecap threshold,
   * and how strongly the sea catches the warm sunset light. */
  const OM = 0.85;
  const sk = min(1, OM * 0.4);

  /* SO(2) swell field — Stokes-broadened sine summation.
   * Each sin(k·x − ω·t) cycle is a complete C→δ→R event. */
  function swell(x, tt) {
    const a = x * 1.0 - tt * 0.35;
    const b = x * 1.8 - tt * 0.70 + 0.8;
    const c = x * 0.6 + 2 - tt * 0.30;
    const d = x * 1.4 - tt * 0.55 + 1.3;
    let h = 0;
    h += 0.32 * (sin(a) + sk * 0.22 * sin(2 * a) + sk * 0.06 * sin(3 * a));
    h += 0.18 * (sin(b) + sk * 0.20 * sin(2 * b));
    h += 0.22 * (sin(c) + sk * 0.16 * sin(2 * c));
    h += 0.10 * sin(d);
    return h;
  }
  const nz = (a, b) => { const s = sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };

  /* Slow sun descent — gentle, ~76 s cycle. Biased low so the panel
   * reads as sunset for most of the loop, opens already golden, and the
   * sun visibly sinks to the horizon and dips below before easing back. */
  const SUN_PERIOD = 76;
  const horizonY = H * 0.44;
  const sunYHigh = H * 0.16;
  const sunYBelow = horizonY + H * 0.05;
  const sunR = min(W, H) * 0.062;

  /* Sunset palette — warm-dominant, composed for cohesion with the
   * Space Zero water/iceplant family. */
  const ZENITH_NIGHT  = [22, 24, 56];
  const ZENITH_DUSK   = [60, 38, 92];
  const SKY_MID_COOL  = [120, 78, 130];
  const SKY_MID_WARM  = [225, 130, 120];
  const SKY_LOW_WARM  = [255, 175, 100];
  const SKY_HORIZON   = [255, 215, 150];

  const SUN_CORE      = [255, 246, 220];
  const SUN_WARM      = [255, 200, 110];
  const SUN_DEEP      = [240, 110, 60];

  const CREST_WARM    = [255, 200, 130];
  const CREST_DEEP    = [255, 130, 70];
  const GLITTER_CORE  = [255, 250, 220];
  const FOAM_WARM     = [255, 240, 215];
  const FOAM_FLAME    = [255, 195, 140];

  let t0 = performance.now() / 1000;

  function draw(now) {
    const t = (now / 1000) - t0;

    /* Sun altitude: smooth oscillation, eased low so we linger near the
     * horizon. Phase offset opens the scene already at golden hour and
     * heading down. pow(.,1.5) keeps the sun low (sunset) most of the loop;
     * altRaw reaches 0 once per cycle → the sun sets below the horizon. */
    const phase = (t / SUN_PERIOD) * TAU + 1.9;
    const altRaw = pow(0.5 + 0.5 * cos(phase), 1.5);
    const sunAlt = altRaw;
    const sunY = sunYBelow + (sunYHigh - sunYBelow) * sunAlt;
    const sunX = W * (0.50 + 0.12 * sin(phase + 0.6));

    /* sunsetIntensity ramps from 0 (higher sun) to 1 (at/below horizon);
     * because sunAlt stays low, the warm sunset palette dominates. */
    const sunsetIntensity = pow(1 - sunAlt, 0.55);

    /* ── sky: rich vertical gradient, warmer near horizon ── */
    ctx.clearRect(0, 0, W, H);
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY + 6);
    const zenith   = blend(ZENITH_NIGHT, ZENITH_DUSK, sunsetIntensity * 0.7);
    const upperMid = blend(SKY_MID_COOL, blend(SKY_MID_COOL, SKY_MID_WARM, 0.55), sunsetIntensity);
    const lowerMid = blend(blend(SKY_MID_WARM, SKY_LOW_WARM, 0.4), SKY_LOW_WARM, sunsetIntensity * 0.85);
    const atHoriz  = blend(SKY_LOW_WARM, SKY_HORIZON, 0.5 + sunsetIntensity * 0.2);
    sky.addColorStop(0.00, rgba(zenith, 1));
    sky.addColorStop(0.40, rgba(upperMid, 1));
    sky.addColorStop(0.75, rgba(lowerMid, 1));
    sky.addColorStop(1.00, rgba(atHoriz, 1));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizonY + 6);

    /* ── sun halo (large warm bloom, larger as it descends) ── */
    const haloR = sunR * (8 + sunsetIntensity * 6);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, haloR);
    halo.addColorStop(0.00, rgba(blend([255, 235, 180], SUN_WARM, 0.5), 0.50 + sunsetIntensity * 0.30));
    halo.addColorStop(0.22, rgba(blend(SUN_WARM, [255, 150, 90], sunsetIntensity * 0.6), 0.22 + sunsetIntensity * 0.18));
    halo.addColorStop(0.55, rgba(blend([240, 130, 90], SKY_MID_WARM, sunsetIntensity * 0.5), 0.06 + sunsetIntensity * 0.08));
    halo.addColorStop(1.00, rgba([200, 90, 70], 0));
    ctx.fillStyle = halo;
    ctx.fillRect(sunX - haloR, sunY - haloR, haloR * 2, haloR * 2);
    ctx.restore();

    /* ── sun disc (clipped above horizon — sun sinks behind sea) ── */
    if (sunY < horizonY + sunR) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, horizonY); ctx.clip();
      const sg = ctx.createRadialGradient(sunX - sunR * 0.15, sunY - sunR * 0.15, 0, sunX, sunY, sunR);
      const sunCentre = blend(SUN_CORE, SUN_WARM, sunsetIntensity * 0.4);
      const sunEdge   = blend(SUN_WARM, SUN_DEEP, sunsetIntensity * 0.6);
      sg.addColorStop(0.00, rgba(sunCentre, 1));
      sg.addColorStop(0.60, rgba(blend(sunCentre, sunEdge, 0.55), 1));
      sg.addColorStop(1.00, rgba(sunEdge, 0.95));
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, TAU); ctx.fill();
      ctx.restore();
    }

    /* ── thin warm cloud streaks ── */
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const cloudWarmth = blend([255, 200, 145], [255, 145, 95], sunsetIntensity);
    for (let i = 0; i < 7; i++) {
      const cy = horizonY * (0.20 + i * 0.09) + sin(t * 0.025 + i * 1.3) * 2;
      const cw = W * (0.35 + 0.40 * nz(i, 7));
      const cx = W * (0.45 + 0.10 * sin(t * 0.012 + i * 2.1));
      const ca = (0.06 + 0.04 * nz(i * 1.3, 4)) * (0.6 + 0.4 * (1 - i / 7));
      const cg = ctx.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0);
      cg.addColorStop(0.0, rgba(cloudWarmth, 0));
      cg.addColorStop(0.5, rgba(cloudWarmth, ca));
      cg.addColorStop(1.0, rgba(cloudWarmth, 0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw / 2, 2.5 + i * 0.35, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    /* ── distant headland silhouette ── */
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let k = 0; k <= 12; k++) {
      const xk = (k / 12) * W;
      const yk = horizonY - (4 + 6 * sin(k * 1.3 + 0.5)) * (k < 7 ? 1 : 0.45);
      ctx.lineTo(xk, yk);
    }
    ctx.lineTo(W, horizonY); ctx.closePath();
    ctx.fillStyle = rgba(blend([60, 30, 60], PAL.ink, 0.5), 0.22);
    ctx.fill();

    /* ── sea base: deep, warming toward the horizon ── */
    const seaBase = ctx.createLinearGradient(0, horizonY, 0, H);
    const seaTop = blend(SKY_LOW_WARM, blend(PAL.iceplantDeep, PAL.waterCobalt, 0.45), 0.55 - sunsetIntensity * 0.30);
    const seaMid1 = blend(PAL.iceplantDeep, PAL.waterCobalt, 0.65);
    const seaMid2 = blend(PAL.waterCobalt, PAL.ink, 0.5);
    const seaBot  = blend(PAL.waterCobalt, PAL.ink, 0.78);
    seaBase.addColorStop(0.00, rgba(seaTop, 1));
    seaBase.addColorStop(0.22, rgba(seaMid1, 1));
    seaBase.addColorStop(0.60, rgba(seaMid2, 1));
    seaBase.addColorStop(1.00, rgba(seaBot, 1));
    ctx.fillStyle = seaBase;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    /* ── orange sun-reflection on the water (the sunset reflected) ──
     * Soft-edged shimmering slivers beneath the sun, widening toward the
     * viewer and gently wobbling with the swell; the row pass below adds
     * the bright broken glints. */
    {
      const seaH = H - horizonY;
      const colTop = blend(SUN_CORE, SUN_WARM, 0.35 + sunsetIntensity * 0.30);
      const colBot = blend(SUN_DEEP, SUN_WARM, 0.25);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const slv = 56;
      for (let s = 0; s < slv; s++) {
        const sp = s / (slv - 1);                                  // 0 horizon → 1 viewer
        const yy = horizonY + seaH * sp;
        const halfW = sunR * (0.55 + (2.8 + sunsetIntensity * 1.6) * sp);
        const wob = swell((sunX / W) * 6 * (0.9 + 2 * sp), t * (0.6 + 0.5 * sp)) * (6 + 12 * sp);
        const cx = sunX + wob;
        const colMix = blend(colTop, colBot, sp);
        const shimmer = 0.45 + 0.55 * (0.5 + 0.5 * swell((cx / W) * 6 * (1 + 2 * sp) + 3.0, t * (0.7 + 0.6 * sp)) / 0.7);
        const a = (0.16 + 0.22 * sunsetIntensity) * (1 - sp * 0.45) * shimmer;
        const g = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
        g.addColorStop(0.0, rgba(colMix, 0));
        g.addColorStop(0.5, rgba(colMix, a));
        g.addColorStop(1.0, rgba(colMix, 0));
        ctx.fillStyle = g;
        ctx.fillRect(cx - halfW, yy, halfW * 2, seaH / slv + 1.5);
      }
      ctx.restore();
    }

    /* ── waves in perspective: crest highlights, sun glitter, whitecaps ── */
    const rows = 40;
    for (let i = 1; i <= rows; i++) {
      const p = i / rows;
      const y = horizonY + (H - horizonY) * p;
      const persp = p;
      const amp = 1.0 + 14 * persp;
      const xfreq = 0.9 + 2.4 * persp;
      const stepX = max(5, 10 - 6 * persp);

      let pH = swell((-10 / W) * 6 * xfreq, t * (0.6 + 0.5 * persp));
      let col = 0;

      const warmCrest = blend(CREST_WARM, CREST_DEEP, sunsetIntensity * 0.6);
      const warmFoam  = blend(FOAM_WARM, FOAM_FLAME, sunsetIntensity * 0.7);
      const warmGlit  = blend(GLITTER_CORE, blend(SUN_WARM, SUN_DEEP, sunsetIntensity * 0.7), 0.55);

      for (let xx = -10; xx <= W + 10; xx += stepX) {
        col++;
        const wx = (xx / W) * 6 * xfreq;
        const h = swell(wx, t * (0.6 + 0.5 * persp));
        const slope = h - pH; pH = h;
        const yy = y + h * amp;

        /* sun-path band: broken reflection extends down from sun toward viewer.
         * Width widens with perspective and with sunset intensity. */
        const distFromSunPath = abs(xx - sunX);
        const sunBandWidth = (70 + 220 * persp) * (1 + sunsetIntensity * 0.5);
        const onSunPath = max(0, 1 - distFromSunPath / sunBandWidth);

        /* up-slope crest highlight — warmed by sunset, brightest on sun-path */
        if (slope > 0) {
          const baseA = 0.04 + 0.10 * slope * 6 * persp;
          const sunA  = onSunPath * 0.20;
          ctx.fillStyle = rgba(warmCrest, baseA + sunA);
          ctx.fillRect(xx, yy - 1.5 * persp, stepX, 1.5 + 2 * persp);
        }

        /* §CRR regeneration kernel as broken glitter on the sun-path.
         * Warm glints catch the sun-facing crests — the shimmering column. */
        const r1 = nz(col * 1.7, i * 3.1), r2 = nz(i * 5.3, col * 2.9);
        if (onSunPath > 0.04 && p > 0.10) {
          // brighter where the crest faces the sun (up-slope) and on-axis
          const crestFace = max(0, slope) * 6 + 0.25;
          const gtAmt = onSunPath * crestFace * (0.45 + 0.55 * persp);
          if (gtAmt > 0.02 && r1 < 0.62) {
            ctx.fillStyle = rgba(warmGlit, min(0.85, gtAmt) * (0.55 + 0.45 * onSunPath));
            const fw = stepX * (0.5 + persp) * (0.6 + 0.8 * r1);
            const jx = (r2 - 0.5) * stepX * 1.1, jy = (r1 - 0.5) * 2 * persp;
            ctx.beginPath();
            ctx.ellipse(xx + jx, yy + jy, fw, 0.6 + 1.4 * persp, 0, 0, TAU);
            ctx.fill();
          }
        }

        /* §CRR whitecap: slope·Ω crosses the rupture threshold → foam.
         * Kept sparse (only the steepest crests, mostly foreground) so the
         * water stays smooth and the reflection reads clearly. */
        const foam = max(0, abs(slope) * (2.0 + 4.0 * OM) * persp - 0.55);
        if (foam > 0.001 && p > 0.45 && r1 < 0.07 + 0.10 * persp) {
          const fa = min(0.40, foam) * (0.30 + 0.45 * persp) * (0.6 + 0.5 * r2);
          ctx.fillStyle = rgba(warmFoam, fa);
          const fw = stepX * (0.5 + persp) * (0.6 + 0.8 * r1);
          const jx = (r2 - 0.5) * stepX * 1.2, jy = (r1 - 0.5) * 2.0 * persp;
          ctx.beginPath();
          ctx.ellipse(xx + jx, yy + jy, fw, (0.8 + 2.0 * persp) * (0.7 + 0.6 * r2), r1 * TAU, 0, TAU);
          ctx.fill();
        }
      }
    }

    /* ── vignettes ── */
    const vgBot = ctx.createLinearGradient(0, H * 0.6, 0, H);
    vgBot.addColorStop(0, rgba(PAL.ink, 0));
    vgBot.addColorStop(1, rgba(PAL.ink, 0.30));
    ctx.fillStyle = vgBot;
    ctx.fillRect(0, H * 0.6, W, H * 0.4);

    const vgEdge = ctx.createRadialGradient(W / 2, H / 2, min(W, H) * 0.35, W / 2, H / 2, max(W, H) * 0.75);
    vgEdge.addColorStop(0, 'rgba(0,0,0,0)');
    vgEdge.addColorStop(1, rgba(PAL.ink, 0.28));
    ctx.fillStyle = vgEdge;
    ctx.fillRect(0, 0, W, H);

    scheduleNext(canvas, draw);
  }
  registerCanvas(canvas);
  requestAnimationFrame(draw);
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  CHROME — shared header & footer injection
 *  Every page includes <div id="site-header"></div> near the top and
 *  <div id="site-footer"></div> before </body>. This function writes the
 *  correct innerHTML into each. The `currentPage` argument is read from
 *  <body data-page="..."> and used to mark the active nav link.
 * ═════════════════════════════════════════════════════════════════════════ */

const NAV = [
  { href: 'index.html',       label: 'Home',         key: 'why' },
  { href: 'what.html',        label: 'What',         key: 'what' },
  { href: 'who.html',         label: 'Who',          key: 'who' },
  { href: 'get-involved.html', label: 'Get Involved', key: 'get-involved' },
];

function renderHeader(currentPage) {
  const links = NAV.map(n => {
    const active = n.key === currentPage ? ' class="active"' : '';
    return `<a href="${n.href}"${active}>${n.label}</a>`;
  }).join('');
  return `
<header class="site-header">
  <div class="header-inner">
    <a href="index.html" class="header-brand">Space Zero</a>
    <nav class="header-nav">${links}</nav>
  </div>
</header>`;
}

function renderFooter() {
  return `
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <canvas id="footerLogo" width="360" height="240"></canvas>
      <p>Space Zero is a 501(c)(3) non-profit company, for the creative advance toward future flourishing.</p>
    </div>
    <div class="footer-col">
      <h4>Visit</h4>
      <ul>
        <li>Space Zero</li>
        <li>983 3rd St</li>
        <li>Crescent City, CA 95531</li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Contact</h4>
      <ul>
        <li><a href="mailto:info@spacezero.net">info@spacezero.net</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <div>&copy; 2026 Space Zero &middot; 501(c)(3)</div>
    <div>Crescent City &middot; California</div>
    <div>Living simulations &middot; <a href="https://www.temporalgrammar.ai">temporalgrammar.ai</a></div>
  </div>
</footer>`;
}

function mountChrome(currentPage) {
  const headerSlot = document.getElementById('site-header');
  const footerSlot = document.getElementById('site-footer');
  if (headerSlot) headerSlot.outerHTML = renderHeader(currentPage);
  if (footerSlot) footerSlot.outerHTML = renderFooter();
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  AUTO-BOOT
 *  Mount chrome, wire up strapline and elements, start logo.
 * ═════════════════════════════════════════════════════════════════════════ */

const ELEMENT_RENDERERS = {
  wisdom: renderWisdom,
  align: renderAlign,
  benevolence: renderBenevolence,
  aesthetics: renderAesthetics,
};

function bootElements() {
  /* Auto-mount any canvas with data-element */
  document.querySelectorAll('canvas[data-element]').forEach(cv => {
    const fn = ELEMENT_RENDERERS[cv.dataset.element];
    if (fn) fn(cv);
  });

  /* Auto-mount logos by id */
  const hero = document.getElementById('heroLogo');
  if (hero) renderLogo(hero, { scale: 0.42, withText: true });

  const footer = document.getElementById('footerLogo');
  if (footer) renderLogo(footer, { scale: 0.36, withText: true });

  const mini = document.getElementById('miniLogo');
  if (mini) renderLogo(mini, { scale: 0.30, withText: true });

  initStrapline();
}

function boot() {
  const currentPage = document.body.dataset.page || '';
  mountChrome(currentPage);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(bootElements);
  } else {
    bootElements();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* Public API */
window.SpaceZero = {
  renderLogo, renderWisdom, renderAlign, renderBenevolence, renderAesthetics,
  initStrapline, mountChrome, bootElements,
  PAL, ROUGH_PAPER,
};

})();
