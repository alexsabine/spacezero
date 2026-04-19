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
  canvas.width  = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const off = document.createElement('canvas');
  off.width  = cssW * dpr;
  off.height = cssH * dpr;
  const offCtx = off.getContext('2d');
  offCtx.scale(dpr, dpr);
  return { ctx, offCtx, off, dpr, W: cssW, H: cssH };
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

/* ── 01 WISDOM: CRR dendrochronology ── */
function renderWisdom(canvas) {
  const cssW = parseInt(canvas.getAttribute('width'));
  const cssH = parseInt(canvas.getAttribute('height'));
  const { ctx, W, H } = setupCanvas(canvas, cssW, cssH);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const paperTex = getPaperTexture(cssW * dpr, cssH * dpr, ROUGH_PAPER);

  const cx = W * 0.42, cy = H * 0.54;
  const Rmax = Math.min(W, H) * 0.50;

  function climate(year) {
    const enso    = 0.20 * Math.sin(2*PI * year / 4.1 + 1.3);
    const solar   = 0.14 * Math.sin(2*PI * year / 11.3 + 0.4);
    const decadal = 0.08 * Math.sin(2*PI * year / 22.7 + 2.1);
    const microVar = 0.04 * Math.sin(2*PI * year / 2.3 + 5.7);
    return 1.0 + enso + solar + decadal + microVar;
  }

  const rings = [];
  let simYear = 0;
  let cRecent = 0;
  const TAU_RECENT = 5;
  let lastYearTime = 0;
  const YEAR_DURATION = 3.2;
  let accumR = Rmax * 0.06;

  for (let y = 0; y < 7; y++) {
    const clim = climate(y);
    const Ccur = Math.min(PI * 0.7, cRecent);
    const regen = Math.exp((Ccur - PI/2) / OMEGA_SOFT) / Math.exp((PI/2) / OMEGA_SOFT);
    const widthMul = clim * (0.5 + 0.5 * regen);
    const ringWidth = widthMul * (Rmax * 0.055);
    const innerR = accumR;
    const outerR = accumR + ringWidth;
    const warp = [];
    let s = (y * 7919 + 13) >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s >>> 0) / 4294967296; };
    for (let h = 2; h <= 6; h++) warp.push({
      k: h, amp: (rnd() - 0.5) * (0.04 / h), phase: rnd() * TAU,
    });
    rings.push({ innerR, outerR, width: ringWidth, year: y, climate: clim, warp, fadeIn: 1.0 });
    accumR = outerR;
    cRecent = (cRecent * (1 - 1/TAU_RECENT)) + clim * (1/TAU_RECENT);
  }
  simYear = 7;

  let rupFlash = 0;
  let memoryHighlight = -1;
  let memoryAlpha = 0;
  let lastMemoryTime = 0;
  const MEMORY_INTERVAL = 5.5;
  let t0 = performance.now() / 1000;
  let tPrev = 0;

  function draw(now) {
    const t = (now / 1000) - t0;
    let dt = t - tPrev; tPrev = t;
    if (!isFinite(dt) || dt < 0 || dt > 0.25) dt = 1/60;

    const bRaw = Math.cos(PI * t / (2 * PI * PI));
    const breath = 0.4 + 0.6 * bRaw * bRaw;

    if (t - lastYearTime > YEAR_DURATION && accumR < Rmax * 0.99) {
      lastYearTime = t;
      const clim = climate(simYear);
      const Ccur = Math.min(PI * 0.7, cRecent);
      const regen = Math.exp((Ccur - PI/2) / OMEGA_SOFT) / Math.exp((PI/2) / OMEGA_SOFT);
      const widthMul = clim * (0.5 + 0.5 * regen);
      const ringWidth = Math.min(widthMul * (Rmax * 0.055), Rmax - accumR);
      const innerR = accumR;
      const outerR = accumR + ringWidth;
      const warp = [];
      let s = (simYear * 7919 + 13) >>> 0;
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s >>> 0) / 4294967296; };
      for (let h = 2; h <= 6; h++) warp.push({
        k: h, amp: (rnd() - 0.5) * (0.04 / h), phase: rnd() * TAU,
      });
      rings.push({ innerR, outerR, width: ringWidth, year: simYear, climate: clim, warp, fadeIn: 0 });
      accumR = outerR;
      cRecent = (cRecent * (1 - 1/TAU_RECENT)) + clim * (1/TAU_RECENT);
      simYear++;
      rupFlash = 1.0;
    }
    for (const r of rings) if (r.fadeIn < 1) r.fadeIn = Math.min(1, r.fadeIn + dt * 2);
    rupFlash = Math.max(0, rupFlash - dt * 1.6);

    if (t - lastMemoryTime > MEMORY_INTERVAL && rings.length > 4) {
      lastMemoryTime = t;
      memoryHighlight = Math.floor(((t * 0.37) % 1) * (rings.length - 1));
      memoryAlpha = 1.0;
    }
    memoryAlpha = Math.max(0, memoryAlpha - dt * 0.6);

    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rmax * 1.3);
    bg.addColorStop(0.00, rgba(PAL.amberCream, 0.52));
    bg.addColorStop(0.50, rgba(PAL.cinnamon,   0.32));
    bg.addColorStop(1.00, rgba(PAL.redwoodBark, 0.18));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const seg = 84;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      const mid = (r.innerR + r.outerR) * 0.5;
      const ewR = r.innerR + r.width * 0.55;
      ctx.beginPath();
      for (let k = 0; k <= seg; k++) {
        const ang = (k / seg) * TAU;
        let rr = ewR;
        for (const h of r.warp) rr += r.outerR * h.amp * Math.cos(h.k * ang + h.phase);
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const ewColour = blend(PAL.cinnamon, PAL.amberCream, 0.3 + r.climate * 0.15);
      ctx.strokeStyle = rgba(ewColour, 0.22 * r.fadeIn);
      ctx.lineWidth = Math.max(1.5, r.width * 0.48);
      ctx.stroke();

      ctx.beginPath();
      for (let k = 0; k <= seg; k++) {
        const ang = (k / seg) * TAU;
        let rr = r.outerR;
        for (const h of r.warp) rr += r.outerR * h.amp * Math.cos(h.k * ang + h.phase);
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const darkness = 0.28 + 0.14 * (1 - r.climate * 0.5);
      ctx.strokeStyle = rgba(PAL.redwoodBark, darkness * r.fadeIn + 0.06 * breath);
      ctx.lineWidth = Math.max(0.9, 1.3 - r.climate * 0.3);
      ctx.stroke();

      if (i === memoryHighlight && memoryAlpha > 0.02) {
        ctx.beginPath();
        for (let k = 0; k <= seg; k++) {
          const ang = (k / seg) * TAU;
          let rr = mid;
          for (const h of r.warp) rr += r.outerR * h.amp * Math.cos(h.k * ang + h.phase);
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(PAL.amberCream, 0.35 * memoryAlpha);
        ctx.lineWidth = Math.max(2, r.width * 0.65);
        ctx.stroke();
      }
    }

    const rayCount = 8;
    for (let ri = 0; ri < rayCount; ri++) {
      const ang = (ri / rayCount) * TAU + 0.3 * Math.sin(ri * 2.1);
      const r0 = Rmax * 0.07;
      const r1 = accumR * 0.92;
      ctx.beginPath();
      const segR = 24;
      for (let k = 0; k <= segR; k++) {
        const tt = k / segR;
        const rad = r0 + (r1 - r0) * tt;
        const jitter = 3 * Math.sin(rad * 0.12 + ri * 3);
        const a = ang + jitter / rad;
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(PAL.redwoodBark, 0.13);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rmax * 0.08);
    core.addColorStop(0.00, rgba(PAL.redwoodBark, 0.70));
    core.addColorStop(0.70, rgba(PAL.redwoodBark, 0.25));
    core.addColorStop(1.00, rgba(PAL.redwoodBark, 0));
    ctx.fillStyle = core;
    ctx.fillRect(cx - Rmax * 0.1, cy - Rmax * 0.1, Rmax * 0.2, Rmax * 0.2);

    if (rupFlash > 0.02) {
      const flashR = accumR;
      const flash = ctx.createRadialGradient(cx, cy, flashR * 0.96, cx, cy, flashR * 1.08);
      flash.addColorStop(0, rgba(PAL.amberCream, 0));
      flash.addColorStop(0.5, rgba(PAL.amberCream, 0.32 * rupFlash));
      flash.addColorStop(1, rgba(PAL.amberCream, 0));
      ctx.fillStyle = flash;
      ctx.fillRect(cx - flashR * 1.2, cy - flashR * 1.2, flashR * 2.4, flashR * 2.4);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.12;
    ctx.drawImage(paperTex.canvas, 0, 0, W, H);
    ctx.restore();

    scheduleNext(canvas, draw);
  }
  registerCanvas(canvas);
  requestAnimationFrame(draw);
}

/* ── 02 ALIGN: topological k=7 murmuration ── */
function renderAlign(canvas) {
  const cssW = parseInt(canvas.getAttribute('width'));
  const cssH = parseInt(canvas.getAttribute('height'));
  const { ctx, W, H } = setupCanvas(canvas, cssW, cssH);
  const N = 120;
  const K = 7;
  const birds = [];
  let s = 31337;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < N; i++) {
    const ang = rnd() * TAU;
    const r = 40 + rnd() * 80;
    birds.push({
      x: W * 0.5 + Math.cos(ang) * r,
      y: H * 0.5 + Math.sin(ang) * r,
      vx: Math.cos(ang + PI/2) * 0.8 + (rnd() - 0.5) * 0.4,
      vy: Math.sin(ang + PI/2) * 0.8 + (rnd() - 0.5) * 0.4,
      size: 1.6 + rnd() * 1.4,
      heading: ang + PI/2,
    });
  }
  const nbrIdx = new Int32Array(K);
  const nbrD2  = new Float32Array(K);
  let tPrev = 0;
  let t0 = performance.now() / 1000;
  let ruptureTimer = 2;
  let ruptureSource = -1;
  let ruptureStrength = 0;

  function draw(now) {
    const t = (now / 1000) - t0;
    let dt = t - tPrev; tPrev = t;
    if (!isFinite(dt) || dt < 0 || dt > 0.1) dt = 1/60;

    const targetX = W * (0.50 + 0.18 * Math.sin(t * 0.10));
    const targetY = H * (0.50 + 0.12 * Math.cos(t * 0.07));

    ruptureTimer -= dt;
    if (ruptureTimer <= 0) {
      ruptureTimer = 6 + rnd() * 4;
      ruptureSource = Math.floor(rnd() * N);
      ruptureStrength = 1.0;
    }
    ruptureStrength = Math.max(0, ruptureStrength - dt * 0.6);

    const sepR = 14;
    const sepR2 = sepR * sepR;
    const maxSpeed = 2.4;
    const minSpeed = 1.0;
    const alignGain = 0.055;
    const cohesionGain = 0.0012;
    const separationGain = 50;
    const ruptureRadius = 90;
    const ruptureR2 = ruptureRadius * ruptureRadius;
    const rupX = ruptureSource >= 0 ? birds[ruptureSource].x : 0;
    const rupY = ruptureSource >= 0 ? birds[ruptureSource].y : 0;

    for (let i = 0; i < N; i++) {
      const b = birds[i];
      for (let q = 0; q < K; q++) { nbrIdx[q] = -1; nbrD2[q] = Infinity; }
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const o = birds[j];
        const dx = o.x - b.x, dy = o.y - b.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < nbrD2[K-1]) {
          let q = K - 1;
          while (q > 0 && d2 < nbrD2[q-1]) {
            nbrD2[q] = nbrD2[q-1];
            nbrIdx[q] = nbrIdx[q-1];
            q--;
          }
          nbrD2[q] = d2;
          nbrIdx[q] = j;
        }
      }
      let mvx = 0, mvy = 0, mcx = 0, mcy = 0;
      let sepX = 0, sepY = 0;
      let nCount = 0;
      for (let q = 0; q < K; q++) {
        const jIdx = nbrIdx[q];
        if (jIdx < 0) continue;
        const o = birds[jIdx];
        mvx += o.vx; mvy += o.vy;
        mcx += o.x;  mcy += o.y;
        nCount++;
        const d2 = nbrD2[q];
        if (d2 < sepR2 && d2 > 1e-3) {
          const w = 1 / d2;
          sepX -= (o.x - b.x) * w;
          sepY -= (o.y - b.y) * w;
        }
      }
      if (nCount > 0) {
        mvx /= nCount; mvy /= nCount;
        mcx /= nCount; mcy /= nCount;
        b.vx += (mvx - b.vx) * alignGain;
        b.vy += (mvy - b.vy) * alignGain;
        b.vx += (mcx - b.x) * cohesionGain;
        b.vy += (mcy - b.y) * cohesionGain;
      }
      b.vx += sepX * separationGain;
      b.vy += sepY * separationGain;
      b.vx += (targetX - b.x) * 0.00018;
      b.vy += (targetY - b.y) * 0.00018;

      if (ruptureStrength > 0.02 && ruptureSource >= 0 && i !== ruptureSource) {
        const dx = b.x - rupX, dy = b.y - rupY;
        const d2 = dx*dx + dy*dy;
        if (d2 < ruptureR2 && d2 > 1) {
          const fallOff = 1 - Math.sqrt(d2) / ruptureRadius;
          const mag = ruptureStrength * fallOff * 0.35;
          const d = Math.sqrt(d2);
          b.vx += (-dy / d) * mag + (dx / d) * mag * 0.4;
          b.vy += ( dx / d) * mag + (dy / d) * mag * 0.4;
        }
      }

      const sp = Math.hypot(b.vx, b.vy);
      if (sp > maxSpeed) { b.vx *= maxSpeed / sp; b.vy *= maxSpeed / sp; }
      else if (sp < minSpeed) {
        const scale = minSpeed / Math.max(sp, 0.01);
        b.vx *= scale; b.vy *= scale;
      }
      b.x += b.vx * dt * 60;
      b.y += b.vy * dt * 60;
      b.heading = Math.atan2(b.vy, b.vx);

      const mX = W * 0.12, mY = H * 0.14;
      if (b.x < mX)       b.vx += 0.22 * (mX - b.x) / mX;
      if (b.x > W - mX)   b.vx -= 0.22 * (b.x - (W - mX)) / mX;
      if (b.y < mY)       b.vy += 0.22 * (mY - b.y) / mY;
      if (b.y > H - mY)   b.vy -= 0.22 * (b.y - (H - mY)) / mY;
    }

    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0.00, rgba(PAL.waterJade, 0.12));
    bg.addColorStop(0.45, rgba(PAL.amberCream, 0.14));
    bg.addColorStop(1.00, rgba(PAL.iceplantPale, 0.12));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < N; i++) {
      const b = birds[i];
      const ang = b.heading;
      const sp = Math.hypot(b.vx, b.vy);
      const len = 6 + b.size * 2 + sp * 1.2;
      const wid = b.size * 1.1;
      const tipX = b.x + Math.cos(ang) * len * 0.55;
      const tipY = b.y + Math.sin(ang) * len * 0.55;
      const tailX = b.x - Math.cos(ang) * len * 0.45;
      const tailY = b.y - Math.sin(ang) * len * 0.45;
      const leftX = tailX + Math.cos(ang + PI/2) * wid * 0.7;
      const leftY = tailY + Math.sin(ang + PI/2) * wid * 0.7;
      const rightX = tailX - Math.cos(ang + PI/2) * wid * 0.7;
      const rightY = tailY - Math.sin(ang + PI/2) * wid * 0.7;
      const alpha = 0.58 + 0.18 * (b.size / 3);
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.fillStyle = rgba(PAL.ink, alpha);
      ctx.fill();
    }
    scheduleNext(canvas, draw);
  }
  registerCanvas(canvas);
  requestAnimationFrame(draw);
}

/* ── 03 BENEVOLENCE: lighthouse on coast ── */
function renderBenevolence(canvas) {
  const cssW = parseInt(canvas.getAttribute('width'));
  const cssH = parseInt(canvas.getAttribute('height'));
  const { ctx, W, H } = setupCanvas(canvas, cssW, cssH);
  const lhX = W * 0.32, lhGroundY = H * 0.72;
  const lhTopY = H * 0.36;
  const lhWidth = W * 0.058;
  const horizonY = H * 0.62;
  let t0 = performance.now() / 1000;

  function draw(now) {
    const t = (now / 1000) - t0;
    const bRaw = Math.cos(PI * t / (2 * PI * PI));
    const breath = 0.4 + 0.6 * bRaw * bRaw;
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0.00, rgba(PAL.iceplantPale, 0.45 * (0.8 + 0.2 * breath)));
    sky.addColorStop(0.50, rgba(PAL.amberCream, 0.60));
    sky.addColorStop(1.00, rgba(PAL.waterJade,  0.52));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizonY);
    const sea = ctx.createLinearGradient(0, horizonY, 0, H);
    sea.addColorStop(0.00, rgba(PAL.waterAqua,  0.62));
    sea.addColorStop(0.60, rgba(PAL.waterCobalt, 0.70));
    sea.addColorStop(1.00, rgba(PAL.redwoodBark, 0.55));
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizonY, W, H - horizonY);
    for (let i = 0; i < 7; i++) {
      const y = horizonY + (H - horizonY) * (0.05 + i * 0.13);
      const offset = Math.sin(t * 0.3 + i * 1.7) * 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      const n = 8;
      for (let k = 0; k <= n; k++) {
        const xk = (k / n) * W;
        const yk = y + Math.sin(xk * 0.02 + t * 0.4 + i) * 2 + offset;
        ctx.lineTo(xk, yk);
      }
      ctx.strokeStyle = rgba(PAL.waterJade, 0.18 - i * 0.015);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    const beamAngRaw = (t / (PI * PHI * 1.6)) * TAU;
    const beamAng = PI + (Math.sin(beamAngRaw) * 0.5 + 0.5) * PI;
    const beamLen = W * 0.75;
    const beamHalfAng = 0.09;
    ctx.save();
    ctx.translate(lhX, lhTopY - lhWidth * 0.3);
    ctx.rotate(beamAng);
    const beamGrad = ctx.createLinearGradient(0, 0, beamLen, 0);
    const beamA = 0.22 * (0.5 + 0.5 * breath);
    beamGrad.addColorStop(0.00, rgba(PAL.amberCream, beamA));
    beamGrad.addColorStop(0.25, rgba(PAL.amberCream, beamA * 0.55));
    beamGrad.addColorStop(0.65, rgba(PAL.amberWarm,  beamA * 0.22));
    beamGrad.addColorStop(1.00, rgba(PAL.amberWarm,  0));
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, beamLen, -beamHalfAng, beamHalfAng);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(W * 0.08, horizonY + 10);
    ctx.lineTo(W * 0.14, horizonY - 4);
    ctx.lineTo(W * 0.22, horizonY + 8);
    ctx.lineTo(W * 0.30, lhGroundY);
    ctx.lineTo(W * 0.42, lhGroundY - 2);
    ctx.lineTo(W * 0.50, horizonY + 14);
    ctx.lineTo(W * 0.56, horizonY + 4);
    ctx.lineTo(W * 0.56, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = rgba(PAL.redwoodBark, 0.80);
    ctx.fill();
    ctx.fillStyle = rgba(PAL.parchment, 0.92);
    ctx.fillRect(lhX - lhWidth/2, lhTopY, lhWidth, lhGroundY - lhTopY);
    ctx.fillStyle = rgba(PAL.ink, 0.75);
    ctx.fillRect(lhX - lhWidth * 0.65, lhTopY - lhWidth * 0.18, lhWidth * 1.3, lhWidth * 0.18);
    ctx.fillStyle = rgba(PAL.amberCream, 0.92);
    ctx.fillRect(lhX - lhWidth * 0.45, lhTopY - lhWidth * 0.55, lhWidth * 0.9, lhWidth * 0.4);
    ctx.beginPath();
    ctx.moveTo(lhX - lhWidth * 0.50, lhTopY - lhWidth * 0.55);
    ctx.lineTo(lhX, lhTopY - lhWidth * 0.95);
    ctx.lineTo(lhX + lhWidth * 0.50, lhTopY - lhWidth * 0.55);
    ctx.closePath();
    ctx.fillStyle = rgba(PAL.ember, 0.88);
    ctx.fill();
    const lanternGlow = 0.25 + 0.5 * breath;
    const lg = ctx.createRadialGradient(lhX, lhTopY - lhWidth * 0.35, 0, lhX, lhTopY - lhWidth * 0.35, lhWidth * 4);
    lg.addColorStop(0, rgba(PAL.amberCream, lanternGlow));
    lg.addColorStop(1, rgba(PAL.amberCream, 0));
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = lg;
    ctx.fillRect(lhX - lhWidth * 5, lhTopY - lhWidth * 5, lhWidth * 10, lhWidth * 10);
    ctx.globalCompositeOperation = 'source-over';
    scheduleNext(canvas, draw);
  }
  registerCanvas(canvas);
  requestAnimationFrame(draw);
}

/* ── 04 AESTHETICS: iceplant bloom, B(C) visibility ── */
function renderAesthetics(canvas) {
  const cssW = parseInt(canvas.getAttribute('width'));
  const cssH = parseInt(canvas.getAttribute('height'));
  const { ctx, W, H } = setupCanvas(canvas, cssW, cssH);
  const N = 42;
  const flowers = [];
  let s = 2718;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < N; i++) {
    flowers.push({
      x: rnd() * W,
      y: H * 0.25 + rnd() * H * 0.70,
      size: 14 + rnd() * 22,
      phase: rnd() * TAU,
      period: 14 + rnd() * 10,
      colorVariant: rnd(),
      jitterX: (rnd() - 0.5) * 3,
      jitterY: (rnd() - 0.5) * 3,
    });
  }
  flowers.sort((a, b) => a.y - b.y);
  let t0 = performance.now() / 1000;

  function draw(now) {
    const t = (now / 1000) - t0;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0.00, rgba(PAL.amberCream, 0.50));
    bg.addColorStop(0.45, rgba(PAL.parchmentWarm, 1.0));
    bg.addColorStop(1.00, rgba(PAL.fern, 0.30));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) {
      const x = (i / 12 + ((s = (s*13)%100) / 100) * 0.1) * W;
      const y = H * (0.4 + (i % 3) * 0.15);
      const rr = 40 + (i * 7 % 20);
      const col = i % 2 ? PAL.moss : PAL.fern;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rr);
      grad.addColorStop(0, rgba(col, 0.18));
      grad.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (const f of flowers) {
      const phase = ((t / f.period) * TAU + f.phase) % TAU;
      const C = 0.5 + 0.5 * Math.cos(phase);
      const Omega = 1 / (2 * PI);
      const B_raw = Math.exp(C / Omega) * (1 - C);
      const B_peak = Math.exp((1 - Omega) / Omega) * Omega;
      const B = Math.min(1, B_raw / B_peak);
      const col = f.colorVariant > 0.75 ? PAL.iceplantPale
                : f.colorVariant > 0.40 ? PAL.iceplantBright
                : PAL.iceplantDeep;
      const size = f.size * (0.85 + 0.25 * B);
      const alpha = 0.55 * B;
      if (alpha < 0.02) continue;
      const x = f.x + f.jitterX * Math.sin(t * 0.5 + f.phase);
      const y = f.y + f.jitterY * Math.cos(t * 0.5 + f.phase);
      const bloom = ctx.createRadialGradient(x, y, 0, x, y, size);
      bloom.addColorStop(0.00, rgba(col, alpha * 1.0));
      bloom.addColorStop(0.28, rgba(col, alpha * 0.80));
      bloom.addColorStop(0.62, rgba(col, alpha * 0.38));
      bloom.addColorStop(1.00, rgba(col, 0));
      ctx.fillStyle = bloom;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
      if (B > 0.6) {
        const coreA = (B - 0.6) / 0.4 * 0.32;
        const core = ctx.createRadialGradient(x, y, 0, x, y, size * 0.22);
        core.addColorStop(0, rgba(PAL.amberCream, coreA));
        core.addColorStop(1, rgba(PAL.amberCream, 0));
        ctx.fillStyle = core;
        ctx.fillRect(x - size, y - size, size * 2, size * 2);
      }
    }
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
  { href: 'index.html',      label: 'Why',          key: 'why' },
  { href: 'what.html',       label: 'What',         key: 'what' },
  { href: 'who.html',        label: 'Who',          key: 'who' },
  { href: 'when-where.html', label: 'When & Where', key: 'when-where' },
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
      <p>A not-for-profit space for somatic and embodied practice, adjacent to HUM Lab on the Northern California coast.</p>
    </div>
    <div class="footer-col">
      <h4>Visit</h4>
      <ul>
        <li><span class="placeholder">[Street address]</span></li>
        <li><span class="placeholder">[Crescent City, CA]</span></li>
        <li><span class="placeholder">[Postal code]</span></li>
        <li><a href="when-where.html" class="mono">Directions &rarr;</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Contact</h4>
      <ul>
        <li><span class="placeholder">[hello@...]</span></li>
        <li><span class="placeholder">[Phone]</span></li>
        <li><span class="placeholder">[Social]</span></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Adjacent</h4>
      <ul>
        <li><a href="#">HUM Lab &rarr;</a></li>
        <li><span class="placeholder">[Partner 1]</span></li>
        <li><span class="placeholder">[Partner 2]</span></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <div>&copy; 2026 Space Zero &middot; 501(c)(3) placeholder</div>
    <div>Crescent City &middot; California</div>
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
