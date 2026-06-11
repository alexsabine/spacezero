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

/* ═══ FIREFOX ADAPTIVE PERFORMANCE ═══
 * Firefox's Canvas2D handles per-frame gradient allocation, blend modes and
 * backdrop-filter far slower than Chrome. Fixes: (a) all per-fish / glow
 * gradients are cached (exact-equivalent, see renderers); (b) the .ff-perf
 * class lets CSS swap the header blur for a solid tint; (c) a governor
 * watches the real frame rate in Firefox and only if it struggles
 * (<45fps for two consecutive 2s windows) latches canvas painting to ~30fps.
 * Simulation is fixed-step, so the fallback changes smoothness only — never
 * behaviour. Chrome's path is byte-identical to the original. */
const FF_PERF = typeof navigator !== 'undefined' && /Firefox/i.test(navigator.userAgent);
let FRAME_MIN_MS = 0;
if (FF_PERF && typeof document !== 'undefined') {
  document.documentElement.classList.add('ff-perf');
  let fr = 0, w0 = performance.now(), bad = 0, latched = false;
  requestAnimationFrame(function gov(now) {
    fr++;
    if (now - w0 >= 2000) {
      if (!latched) {
        bad = (fr * 1000 / (now - w0)) < 45 ? bad + 1 : 0;
        if (bad >= 2) { latched = true; FRAME_MIN_MS = 31; }
      }
      fr = 0; w0 = now;
    }
    requestAnimationFrame(gov);
  });
}
const _lastPaint = new Map();

function scheduleNext(canvas, draw) {
  if ((!_io || _visible.has(canvas)) && !document.hidden) {
    if (!FRAME_MIN_MS) { requestAnimationFrame(draw); return; }
    requestAnimationFrame(function paced(now) {
      const last = _lastPaint.get(canvas) || 0;
      if (now - last >= FRAME_MIN_MS) {
        _lastPaint.set(canvas, now);
        draw(now);
      } else if ((!_io || _visible.has(canvas)) && !document.hidden) {
        requestAnimationFrame(paced);
      } else {
        _pending.set(canvas, () => requestAnimationFrame(draw));
      }
    });
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
    return { x: bx, y: by };   /* local frame — drawFish applies translate+rotate */
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
    /* drawn in the fish's own frame so every gradient is a constant,
       built once per fish and reused — zero per-frame allocations */
    const L = f.len, ca = 1, sa2 = 0, nx = 0, ny = 1;
    const dp = f.depth, depthAlpha = .65 + dp * .35;
    const cA = cos(f.ang), sA = sin(f.ang);
    X.save(); X.globalAlpha = depthAlpha;
    X.translate(f.x, f.y); X.rotate(f.ang);
    X.save(); X.globalAlpha = .04 * depthAlpha;
    X.beginPath(); X.ellipse(3 * cA + L * .06 * sA, -3 * sA + L * .06 * cA, L * .3, L * .035, 0, 0, T); X.fillStyle = '#000'; X.fill(); X.restore();
    // tail fin
    const tb = bP(f, .88, 0), tt = bP(f, 1, 0);
    X.save(); X.globalAlpha = .5;
    const tpx = -1, tpy = 0, sp = L * .14, tl = L * .12;
    X.beginPath(); X.moveTo(tb.x, tb.y);
    X.bezierCurveTo(tt.x + tpx * tl * .3 + nx * sp * .6, tt.y + tpy * tl * .3 + ny * sp * .6, tt.x + tpx * tl + nx * sp, tt.y + tpy * tl + ny * sp, tt.x + tpx * tl * .5, tt.y + tpy * tl * .5);
    X.lineTo(tt.x, tt.y); X.lineTo(tt.x + tpx * tl * .5, tt.y + tpy * tl * .5);
    X.bezierCurveTo(tt.x + tpx * tl - nx * sp, tt.y + tpy * tl - ny * sp, tt.x + tpx * tl * .3 - nx * sp * .6, tt.y + tpy * tl * .3 - ny * sp * .6, tb.x, tb.y);
    if (!f._tg) {
      const tg = X.createLinearGradient(tt.x + nx * sp, tt.y + ny * sp, tt.x - nx * sp, tt.y - ny * sp);
      tg.addColorStop(0, `hsla(${f.h + 8},${f.s - 12}%,${f.l - 5}%,.35)`); tg.addColorStop(.5, `hsla(${f.h},${f.s}%,${f.l + 5}%,.5)`); tg.addColorStop(1, `hsla(${f.h + 8},${f.s - 12}%,${f.l - 5}%,.35)`);
      f._tg = tg;
    }
    X.fillStyle = f._tg; X.fill();
    if (dp > .3) { X.strokeStyle = `hsla(${f.h},${f.s - 20}%,${f.l + 10}%,.12)`; X.lineWidth = .4; for (let i = 0; i < 7; i++) { const sv = (i / 6) * 2 - 1; X.beginPath(); X.moveTo(tb.x, tb.y); X.quadraticCurveTo(tt.x + tpx * tl * .3 + nx * sv * sp * .3, tt.y + tpy * tl * .3 + ny * sv * sp * .3, tt.x + tpx * tl * .7 + nx * sv * sp * .85, tt.y + tpy * tl * .7 + ny * sv * sp * .85); X.stroke(); } }
    X.restore();
    // dorsal
    if (dp > .25) { const d1 = bP(f, .22, -1), d2 = bP(f, .52, -1), dH = L * .1 + sin(t * 1.3 + f.id) * .003 * L; X.save(); X.globalAlpha = .4; X.beginPath(); X.moveTo(d1.x, d1.y); X.bezierCurveTo(d1.x + nx * dH * .4, d1.y + ny * dH * .4, (d1.x + d2.x) / 2 + nx * dH, (d1.y + d2.y) / 2 + ny * dH, d2.x, d2.y); if (!f._dg) { const dg = X.createLinearGradient(d1.x + nx * dH, d1.y + ny * dH, d1.x, d1.y); dg.addColorStop(0, `hsla(${f.h},${f.s - 10}%,${f.l - 5}%,.12)`); dg.addColorStop(1, `hsla(${f.h + 5},${f.s - 5}%,${f.l}%,.35)`); f._dg = dg; } X.fillStyle = f._dg; X.fill(); X.restore(); }
    // anal
    if (dp > .3) { const a1 = bP(f, .52, 1), a2 = bP(f, .7, 1); X.save(); X.globalAlpha = .3; X.beginPath(); X.moveTo(a1.x, a1.y); X.quadraticCurveTo((a1.x + a2.x) / 2 - nx * L * .06, (a1.y + a2.y) / 2 - ny * L * .06, a2.x, a2.y); X.fillStyle = `hsla(${f.h + 5},${f.s - 12}%,${f.l - 3}%,.3)`; X.fill(); X.restore(); }
    // body
    const bStep = dp > .5 ? .012 : .025;
    X.beginPath();
    for (let s = 0; s <= 1; s += bStep) { const p = bP(f, s, -1); s === 0 ? X.moveTo(p.x, p.y) : X.lineTo(p.x, p.y); }
    for (let s = 1; s >= 0; s -= bStep) { const p = bP(f, s, 1); X.lineTo(p.x, p.y); }
    X.closePath(); X.save(); X.clip();
    if (!f._bg) {
    const bg = X.createLinearGradient(nx * L * .13, ny * L * .13, -nx * L * .13, -ny * L * .13);
    bg.addColorStop(0, `hsla(${f.h - 5},${f.s + 5}%,${max(25, f.l - 12)}%,.9)`);
    bg.addColorStop(.2, `hsla(${f.h + 10},${f.s + 16}%,${min(90, f.l + 14)}%,.93)`);
    bg.addColorStop(.42, `hsla(${f.h + 18},${f.s + 6}%,${min(93, f.l + 22)}%,.91)`);
    bg.addColorStop(.6, `hsla(${f.h + 5},${f.s + 2}%,${min(90, f.l + 15)}%,.91)`);
    bg.addColorStop(.8, `hsla(${f.h},${f.s}%,${min(88, f.l + 8)}%,.9)`);
    bg.addColorStop(1, `hsla(${f.h + 15},${f.s - 5}%,${min(95, f.l + 25)}%,.88)`);
    f._bg = bg;
    }
    X.fillStyle = f._bg; X.fill();
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
      if (FF_PERF) { const rr = sR * (.85 + vF * .3); X.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2); }
      else { X.beginPath(); X.arc(p.x, p.y, sR * (.85 + vF * .3), -P * .7, P * .7); X.fill(); }
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
    if (dp > .35) { const pa = sin(f.pect.ph * 2.5) * .3 + f.pect.sa * .15, pp = bP(f, .2, .55); X.save(); X.globalAlpha = .25; X.translate(pp.x, pp.y); X.rotate(P * .3 + pa); X.beginPath(); X.moveTo(0, 0); X.bezierCurveTo(-L * .01, L * .035, -L * .05, L * .06, -L * .07, L * .048); X.bezierCurveTo(-L * .055, L * .02, -L * .02, L * .005, 0, 0); if (!f._pg) { const pfg = X.createLinearGradient(0, 0, -L * .06, L * .05); pfg.addColorStop(0, `hsla(${f.h},${f.s - 15}%,${f.l + 5}%,.4)`); pfg.addColorStop(1, `hsla(${f.h + 10},${f.s - 20}%,${f.l + 10}%,.1)`); f._pg = pfg; } X.fillStyle = f._pg; X.fill(); X.restore(); }
    // eye
    const ep = bP(f, .07, -.14), eR = L * .017;
    X.beginPath(); X.arc(ep.x, ep.y, eR, 0, T);
    if (!f._eg) { const eg = X.createRadialGradient(ep.x - eR * .1, ep.y - eR * .1, 0, ep.x, ep.y, eR);
    eg.addColorStop(0, '#e8e4d8'); eg.addColorStop(.8, '#d0ccc0'); eg.addColorStop(1, '#a09888'); f._eg = eg; }
    X.fillStyle = f._eg; X.fill();
    X.beginPath(); X.arc(ep.x + eR * .1, ep.y, eR * .55, 0, T);
    if (!f._ig) { const ig2 = X.createRadialGradient(ep.x + eR * .1, ep.y, eR * .08, ep.x + eR * .1, ep.y, eR * .55);
    ig2.addColorStop(0, '#806830'); ig2.addColorStop(.5, '#503815'); ig2.addColorStop(1, '#201005'); f._ig = ig2; }
    X.fillStyle = f._ig; X.fill();
    X.beginPath(); X.arc(ep.x + eR * .14, ep.y, eR * .25, 0, T); X.fillStyle = '#080404'; X.fill();
    X.beginPath(); X.arc(ep.x + eR * .25, ep.y - eR * .18, eR * .1, 0, T); X.fillStyle = 'rgba(255,255,255,.5)'; X.fill();
    X.restore();
  }

  /* ── underwater field ── */
  function drawWater() {
    if (!drawWater._bg) {
      const bg = X.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0.00, rgba(blend(PAL.waterJade, PAL.amberCream, 0.30), 1.0));
      bg.addColorStop(0.30, rgba(PAL.waterEmerald, 1.0));
      bg.addColorStop(0.66, rgba(PAL.waterAqua, 1.0));
      bg.addColorStop(1.00, rgba(blend(PAL.waterCobalt, PAL.ink, 0.45), 1.0));
      drawWater._bg = bg;
    }
    X.fillStyle = drawWater._bg; X.fillRect(0, 0, W, H);
    // god-rays from upper-left
    X.save(); X.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      const bx = W * (0.12 + i * 0.2) + sin(t * 0.12 + i) * W * 0.03;
      const wdt = W * (0.05 + 0.02 * sin(t * 0.2 + i * 1.3));
      const a = 0.05 + 0.03 * (0.5 + 0.5 * sin(t * 0.3 + i * 2));
      if (!drawWater._ray) {
        const g = X.createLinearGradient(0, 0, W * 0.12, H);
        g.addColorStop(0, rgba(PAL.amberCream, 1));
        g.addColorStop(1, rgba(PAL.waterJade, 0));
        drawWater._ray = g;
      }
      X.save(); X.translate(bx, 0); X.globalAlpha = a;
      X.fillStyle = drawWater._ray;
      X.beginPath(); X.moveTo(-wdt, 0); X.lineTo(wdt, 0); X.lineTo(W * 0.12 + wdt * 2, H); X.lineTo(W * 0.12 - wdt * 2, H); X.closePath(); X.fill();
      X.restore();
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
    /* fixed 60 Hz substeps: the flocking impulses are tuned per-tick, so this
       keeps schooling identical at any paint rate */
    upd._acc = (upd._acc || 0) + dt;
    let simSteps = 0;
    while (upd._acc >= 1 / 60 && simSteps < 4) { upd(1 / 60); upd._acc -= 1 / 60; simSteps++; }
    if (simSteps === 4) upd._acc = 0;
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
    if (!draw._vg) {
      const vg = X.createRadialGradient(W / 2, H / 2, min(W, H) * 0.3, W / 2, H / 2, max(W, H) * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, rgba(blend(PAL.waterCobalt, PAL.ink, 0.5), 0.45));
      draw._vg = vg;
    }
    X.fillStyle = draw._vg; X.fillRect(0, 0, W, H);
    scheduleNext(canvas, draw);
  }
  registerCanvas(canvas);
  requestAnimationFrame(draw);
}

/* ── 03 BENEVOLENCE: technology with heart — two agents entraining ──
 *  §CRR engine: two hearts (and two breaths) are CRR limit-cycle oscillators —
 *  each accumulates coherence C(t)=∫L dτ to a rupture at C·Ω = 1 (systole, the
 *  R-spike) and regenerates R = ∫φ·exp(C/Ω)·Θ dτ as it refills. The two agents
 *  start detuned, then couple (Kuramoto, K·sin(θⱼ−θᵢ)); as the connection K
 *  rises the rhythms phase-lock — cardiac / neural entrainment between people.
 *  Coupling drives the picture: colour converges toward the sunset's gold, a
 *  shared radiance pulses from the midpoint, and (honestly, from the real
 *  phases) the two ECG traces slide into alignment through time. Breath entrains
 *  the same way — the slow halo and the baseline wander on the trace. Public
 *  framing: love and kindness shared; two becoming one rhythm. */
function renderBenevolence(canvas) {
  const cssW = parseInt(canvas.getAttribute('width'));
  const cssH = parseInt(canvas.getAttribute('height'));
  const { ctx, W, H } = setupCanvas(canvas, cssW, cssH);
  const { sin, cos, exp, pow, min, max, abs } = Math;
  const SCL = W / 460;
  const GC = new Map();                          // gradient cache (bounded by 1/64 quantisation)
  const Q = (v, n2) => Math.round(v * n2) / n2;
  const sstep = (a, b, x) => { const k = min(1, max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

  /* two agents — detuned CRR limit-cycle oscillators (heart + breath) */
  const wA = TAU / 1.00, wB = TAU / 1.11;     // cardiac angular frequency (rad/s)
  const wbA = TAU / 4.0, wbB = TAU / 4.6;     // breath angular frequency
  let thA = 0.0, thB = PI * 0.92;             // cardiac phases
  let beA = 0.0, beB = PI * 0.60;             // breath phases
  const KC = 1.60, KB = 0.80;                 // peak coupling (cardiac / breath)
  let cohC = 0, E = 0;                        // phase order parameter / entrainment level

  /* colour — each agent's hue converges toward the sunset's gold as they cohere */
  const GOLD  = [245, 168, 86];                                 // sunset gold (the ocean panel)
  const CORAL = [240, 122, 96];                                 // sunset coral
  const C_A = blend(PAL.iceplantBright, PAL.iceplantDeep, 0.30);// agent A — cool rose
  const C_B = blend(PAL.iceplantBright, CORAL, 0.55);           // agent B — warm coral

  /* ECG PQRST + mechanical pulse (shared waveform shapes) */
  function gss(x, c, w) { const d = (x - c) / w; return exp(-d * d); }
  function ecg(u) {
    return  0.10 * gss(u, 0.16,  0.024)   // P
          - 0.07 * gss(u, 0.255, 0.011)   // Q
          + 1.00 * gss(u, 0.285, 0.020)   // R
          - 0.24 * gss(u, 0.330, 0.016)   // S
          + 0.26 * gss(u, 0.47,  0.038);  // T
  }
  function pls(u, c, upT, dnT) { const d = u < c ? (c - u) / upT : (u - c) / dnT; return exp(-d * d); }
  function beat(u) { return 1.00 * pls(u, 0.30, 0.018, 0.10) + 0.42 * pls(u, 0.52, 0.022, 0.12); }

  function heartPath(cx, cy, s) {
    ctx.beginPath();
    const N = 80;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      const x = 16 * pow(sin(a), 3);
      const y = 13 * cos(a) - 5 * cos(2 * a) - 2 * cos(3 * a) - cos(4 * a);
      const px = cx + x * s, py = cy - y * s;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /* ── fixed-rate integrator + ECG history (a true scrolling monitor) ── */
  const FS = 160, DS = 1 / FS, WIN = 2.4, NV = Math.round(WIN * FS);
  const yA = new Float32Array(NV), yB = new Float32Array(NV);
  let head = 0, filled = 0;
  const ringsShared = [];        // {t, str} radiant rings from the midpoint
  const ripA = [], ripB = [];    // per-heart ripple birth times
  let uPrevA = 0, uPrevB = 0, simT = 0;

  function substep(ds) {
    simT += ds;
    // connection cycle (~24 s): APART (held) → come together → TOGETHER (held) → release
    const p = (simT % 24) / 24;
    const conn = sstep(0.30, 0.45, p) * (1 - sstep(0.80, 0.97, p));
    const Kc = KC * conn, Kb = KB * conn;
    thA += (wA  + Kc * sin(thB - thA)) * ds;
    thB += (wB  + Kc * sin(thA - thB)) * ds;
    beA += (wbA + Kb * sin(beB - beA)) * ds;
    beB += (wbB + Kb * sin(beA - beB)) * ds;

    const Rc = abs(cos((thA - thB) / 2));
    cohC += (Rc - cohC) * (1 - exp(-ds / 0.5));         // phase alignment (rings)
    E    += (conn - E)  * (1 - exp(-ds / 0.8));         // entrainment level (visuals)

    const uA = (thA / TAU) % 1, uB = (thB / TAU) % 1, cr = 0.285;
    if (uPrevA < cr && uA >= cr) {                       // agent A systole (rupture δ)
      ripA.push(simT); if (ripA.length > 4) ripA.shift();
      if (E > 0.4 && cohC > 0.5) { ringsShared.push({ t: simT, str: E }); if (ringsShared.length > 5) ringsShared.shift(); }
    }
    if (uPrevB < cr && uB >= cr) { ripB.push(simT); if (ripB.length > 4) ripB.shift(); }
    uPrevA = uA; uPrevB = uB;

    yA[head] = ecg(uA); yB[head] = ecg(uB);
    head = (head + 1) % NV; if (filled < NV) filled++;
  }

  const heartH = H * 0.28, baseS = heartH / 29;
  let tPrev = performance.now() / 1000, acc = 0;

  function draw(now) {
    const t = now / 1000;
    let dt = t - tPrev; tPrev = t;
    if (!isFinite(dt) || dt < 0) dt = 1 / 60;
    if (dt > 0.1) dt = 0.1;
    acc += dt;
    let steps = 0;
    while (acc >= DS && steps < 28) { substep(DS); acc -= DS; steps++; }

    /* ── frame state ── */
    const uA = (thA / TAU) % 1, uB = (thB / TAU) % 1;
    const bvA = beat(uA), bvB = beat(uB), bvMix = (bvA + bvB) * 0.5;
    const brA = 0.5 + 0.5 * sin(beA), brB = 0.5 + 0.5 * sin(beB);
    const en = E, coh = cohC, qe = Q(en, 64);
    const colA = blend(C_A, GOLD, 0.80 * en);
    const colB = blend(C_B, GOLD, 0.80 * en);
    const sepF = 0.178 - 0.034 * en;                   // lean in as they cohere
    const hcy = H * 0.37, xA = W * (0.5 - sepF), xB = W * (0.5 + sepF);
    const Mx = W * 0.5, My = hcy;

    /* inner painters (close over this frame's colours + geometry) */
    function drawHeart(cx, cy, s, col, bv, hid) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const bR = heartH * (0.55 + 0.18 * bv), ba = 0.14 + 0.24 * bv;
      const blId = 'bl' + hid + ':' + qe;
      let bl = GC.get(blId);
      if (!bl) {
        bl = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        bl.addColorStop(0.00, rgba(blend(col, PAL.amberCream, 0.25), 1));
        bl.addColorStop(0.45, rgba(col, 0.4));
        bl.addColorStop(1.00, rgba(col, 0));
        GC.set(blId, bl);
      }
      ctx.translate(cx, cy); ctx.scale(bR, bR); ctx.globalAlpha = ba;
      ctx.fillStyle = bl; ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
      heartPath(cx, cy, s);
      const top = cy - 12 * s, bot = cy + 17 * s;
      const f = ctx.createLinearGradient(0, top, 0, bot);
      f.addColorStop(0.00, rgba(blend(col, PAL.amberCream, 0.42), 1));
      f.addColorStop(0.42, rgba(col, 1));
      f.addColorStop(0.80, rgba(blend(col, PAL.ink, 0.22), 1));
      f.addColorStop(1.00, rgba(blend(blend(col, PAL.ink, 0.22), PAL.ember, 0.4), 1));
      ctx.fillStyle = f; ctx.fill();
      ctx.save(); heartPath(cx, cy, s); ctx.clip();
      const sx = cx - 6 * s, sy = cy - 7 * s;
      const sp = ctx.createRadialGradient(sx, sy, 0, sx, sy, 13 * s);
      sp.addColorStop(0.0, rgba(PAL.parchment, 0.45 + 0.15 * bv));
      sp.addColorStop(0.5, rgba(blend(col, PAL.parchment, 0.6), 0.16));
      sp.addColorStop(1.0, rgba(col, 0));
      ctx.fillStyle = sp; ctx.fillRect(cx - 18 * s, cy - 20 * s, 36 * s, 36 * s);
      ctx.restore();
      heartPath(cx, cy, s);
      ctx.strokeStyle = rgba(blend(col, PAL.ink, 0.35), 0.42);
      ctx.lineWidth = max(1, 1.3 * SCL);
      ctx.stroke();
    }

    function drawTrace(buf, baseY, amp, col, gid) {
      if (filled < 2) return;
      const n = filled, start = (head - filled + NV) % NV, x0 = W * 0.06, x1 = W * 0.94;
      const X = i => x0 + (i / (n - 1)) * (x1 - x0);
      const Y = i => baseY - buf[(start + i) % NV] * amp;
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(i));
      ctx.strokeStyle = rgba(col, 0.16); ctx.lineWidth = max(3, 5 * SCL); ctx.stroke();
      ctx.restore();
      let g = GC.get('tg' + gid + ':' + qe);
      if (!g) {
        g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0.0, rgba(col, 0.0));
        g.addColorStop(0.5, rgba(col, 0.5));
        g.addColorStop(1.0, rgba(blend(col, PAL.amberCream, 0.2), 0.95));
        GC.set('tg' + gid + ':' + qe, g);
      }
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(i));
      ctx.strokeStyle = g; ctx.lineWidth = max(1.3, 1.9 * SCL); ctx.stroke();
      const px = X(n - 1), py = Y(n - 1), pr = 13 * SCL;
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      let pg = GC.get('pg' + gid + ':' + qe);
      if (!pg) {
        pg = ctx.createRadialGradient(0, 0, 0, 0, 0, pr);
        pg.addColorStop(0, rgba(PAL.amberCream, 0.85)); pg.addColorStop(0.4, rgba(col, 0.4)); pg.addColorStop(1, rgba(col, 0));
        GC.set('pg' + gid + ':' + qe, pg);
      }
      ctx.translate(px, py);
      ctx.fillStyle = pg; ctx.fillRect(-pr, -pr, pr * 2, pr * 2);
      ctx.restore();
      ctx.beginPath(); ctx.arc(px, py, max(1.4, 2.0 * SCL), 0, TAU);
      ctx.fillStyle = rgba(PAL.parchment, 0.95); ctx.fill();
    }

    /* ── background: warm parchment, sunset-gold halo warming as they cohere ── */
    ctx.clearRect(0, 0, W, H);
    const bgK = Q(0.04 + 0.17 * en + 0.05 * bvMix, 128);
    let bg = GC.get('bg:' + bgK);
    if (!bg) {
      bg = ctx.createRadialGradient(Mx, My, 0, Mx, My, max(W, H) * 0.8);
      bg.addColorStop(0.00, rgba(blend(PAL.parchment, GOLD, bgK), 1));
      bg.addColorStop(0.42, rgba(PAL.parchment, 1));
      bg.addColorStop(1.00, rgba(PAL.parchmentWarm, 1));
      GC.set('bg:' + bgK, bg);
    }
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    /* ── breath halos behind each heart (swell together when breath entrains) ── */
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const a of [[xA, brA, colA, 'hA:'], [xB, brB, colB, 'hB:']]) {
      const hx = a[0], br = a[1], col = a[2];
      const r = heartH * (1.05 + 0.45 * br), al = (0.05 + 0.07 * br) * (0.55 + 0.45 * en);
      const id = a[3] + qe;
      let g = GC.get(id);
      if (!g) {
        g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, rgba(blend(col, PAL.amberCream, 0.35), 1));
        g.addColorStop(1, rgba(col, 0));
        GC.set(id, g);
      }
      ctx.save(); ctx.translate(hx, hcy); ctx.scale(r, r); ctx.globalAlpha = al;
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    }
    ctx.restore();

    /* ── shared field of warmth + radiating rings (love / kindness, when cohered) ── */
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    if (en > 0.04) {                                    // continuous shared aura — radiate together
      const r = heartH * (1.7 + 0.5 * bvMix), al = en * (0.10 + 0.17 * bvMix);
      let g = GC.get('aura');
      if (!g) {
        g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0.00, rgba(blend(GOLD, PAL.amberCream, 0.35), 1));
        g.addColorStop(0.55, rgba(GOLD, 0.35));
        g.addColorStop(1.00, rgba(GOLD, 0));
        GC.set('aura', g);
      }
      ctx.save(); ctx.translate(Mx, My); ctx.scale(r, r); ctx.globalAlpha = al;
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    }
    for (const rg of ringsShared) {                     // one expanding ring per shared beat
      const age = simT - rg.t; if (age > 1.9) continue;
      const k = age / 1.9;
      const rad = (0.08 + 0.64 * k) * max(W, H) * 0.66;
      const al = (1 - k) * (1 - k) * 0.55 * rg.str;
      ctx.strokeStyle = rgba(blend(GOLD, PAL.amberCream, 0.32), al);
      ctx.lineWidth = max(0.6, 3.8 * (1 - k) * SCL);
      ctx.beginPath(); ctx.arc(Mx, My, rad, 0, TAU); ctx.stroke();
    }
    const mb = bvMix * en;                              // bright bloom as both beat as one
    if (mb > 0.03) {
      const r = heartH * (0.8 + 0.9 * mb);
      let g = GC.get('mb');
      if (!g) {
        g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, rgba(blend(GOLD, PAL.amberCream, 0.45), 1));
        g.addColorStop(1, rgba(GOLD, 0));
        GC.set('mb', g);
      }
      ctx.save(); ctx.translate(Mx, My); ctx.scale(r, r); ctx.globalAlpha = 0.38 * mb;
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    }
    ctx.restore();

    /* ── connection bridge ∝ entrainment ── */
    if (en > 0.05) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const al = 0.18 * en * (0.5 + 0.5 * bvMix), sx = xB - xA;
      let g = GC.get('br:' + qe);
      if (!g) {
        g = ctx.createLinearGradient(-0.5, 0, 0.5, 0);
        g.addColorStop(0.0, rgba(colA, 0.4));
        g.addColorStop(0.5, rgba(blend(GOLD, PAL.amberCream, 0.25), 1));
        g.addColorStop(1.0, rgba(colB, 0.4));
        GC.set('br:' + qe, g);
      }
      ctx.translate(Mx, 0); ctx.scale(sx, 1); ctx.globalAlpha = al;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, My, 0.5, heartH * 0.5, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    /* ── per-heart ripples (each agent's own pulse) ── */
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const grp of [[ripA, xA, colA], [ripB, xB, colB]]) {
      const list = grp[0], hx = grp[1], col = grp[2];
      for (const bt of list) {
        const age = simT - bt; if (age > 1.3) continue;
        const k = age / 1.3;
        heartPath(hx, hcy, baseS * (1.0 + 0.8 * k));
        ctx.strokeStyle = rgba(col, (1 - k) * (1 - k) * 0.4);
        ctx.lineWidth = max(0.5, 2.0 * (1 - k) * SCL);
        ctx.stroke();
      }
    }
    ctx.restore();

    /* ── the two hearts ── */
    drawHeart(xA, hcy, baseS * (1 + 0.09 * bvA) * (1 + 0.02 * brA), colA, bvA, 'A');
    drawHeart(xB, hcy, baseS * (1 + 0.09 * bvB) * (1 + 0.02 * brB), colB, bvB, 'B');

    /* ── dual ECG monitor: graticule + two traces sliding into alignment ── */
    const amp = H * 0.052, top = H * 0.64, bottom = H * 0.99;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, top, W, bottom - top); ctx.clip();
    ctx.strokeStyle = rgba(PAL.iceplantDeep, 0.045); ctx.lineWidth = 1;
    const gs = max(16, W / 24);
    for (let x = (W * 0.5) % gs; x < W; x += gs) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
    for (let y = top + gs; y < bottom; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    drawTrace(yA, H * 0.745 + H * 0.012 * sin(beA), amp, colA, 'A');   // breath baseline wander
    drawTrace(yB, H * 0.895 + H * 0.012 * sin(beB), amp, colB, 'B');

    /* ── soft vignette ── */
    if (!draw._vg) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, min(W, H) * 0.32, W / 2, H / 2, max(W, H) * 0.74);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, rgba(PAL.ink, 0.12));
      draw._vg = vg;
    }
    ctx.fillStyle = draw._vg; ctx.fillRect(0, 0, W, H);

    scheduleNext(canvas, draw);
  }
  registerCanvas(canvas);
  requestAnimationFrame(draw);
}

/* ── 04 AESTHETICS: the ocean at sunset — Song of the Wave ──
 *  §CRR engine: the SO(2) swell is a living Coherence→Rupture→Regeneration
 *  field. Every sin(k·x − ω·t) cycle is one complete C→δ→R event — phase
 *  accumulates (C), wraps at 2π (the rupture δ, where C·Ω = 1) and resets (R);
 *  exp(−α·Ω·d) is the regeneration kernel read as optical transmission, so a
 *  single Ω (boundary permeability) governs amplitude, turbidity, whitecaps,
 *  caustic focus and the morphology of the life on the bed. Here Ω is held calm
 *  so the sea lies gentle while the sun gently lowers; the orange of the sky is
 *  returned by the water as Fresnel reflection — a real sunset on the water.
 *  Ported from the WebGL composition (temporalgrammar.ai); only the palette is
 *  graded to sunset and the sun's descent is driven from JS. Public framing:
 *  neuroaesthetics — beauty as a way of being alive, light given back as colour. */
function renderAesthetics(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false });
  if (!gl) { renderAestheticsFallback(canvas); return; }   // no WebGL → graceful 2D sunset

  const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FS = `precision highp float;
uniform vec2 R;uniform float T,OM,ZM,SH;
const float PI=3.14159265;
const float R0=0.02037;              // Fresnel R₀=((n₂−n₁)/(n₂+n₁))²
const vec3 AL=vec3(.50,.045,.005);   // absorption α (Pope & Fry 1997)

float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}
float fb(vec2 p){float v=0.,a=.5;for(int i=0;i<6;i++){v+=a*n2(p);p*=2.03;a*=.49;}return v;}

// SO(2) swell field — Ω scales amplitude + Stokes nonlinearity
float sea(vec2 p,float t,float lod){
  float h=0.,om=OM,sk=min(1.,om*.4);
  float a=p.x*.28-t*.35+p.y*.03, b=p.x*.55-t*.7+p.y*.07+.8;
  float c=p.x*.22+p.y*.09-t*.3+2., d=p.x*.45+p.y*.12-t*.55+1.3;
  h+=.3*om*(sin(a)+sk*.2*sin(2.*a)+sk*.06*sin(3.*a));
  h+=.15*om*(sin(b)+sk*.2*sin(2.*b)+sk*.06*sin(3.*b));
  h+=.2*om*(sin(c)+sk*.15*sin(2.*c));
  h+=.08*om*(sin(d)+sk*.15*sin(2.*d));
  if(lod<.8){h+=fb(p*1.8+vec2(-t*.25,-t*.08))*.08*om*(1.-lod);
    h+=fb(p*3.5+vec2(t*.15,-t*.2))*.035*om*(1.-lod);}
  if(lod<.5){float f=1.-lod*2.;
    h+=n2(p*8.+vec2(-t*.7,t*.2))*.015*om*f;
    h+=n2(p*16.+vec2(t*1.1,t*.4))*.006*om*f;
    h+=n2(p*32.+vec2(-t*1.5,-t*.8))*.003*om*f;}
  return h;
}

// Sky — sunset palette (artistic): molten gold at the horizon → coral → rose
// → deep indigo at the zenith, with a warm aura + afterglow band on the sun.
vec3 skyC(vec3 rd,vec3 sun,float t){
  float g=max(0.,rd.y);
  vec3 cGold=vec3(1.15,.60,.26), cCoral=vec3(.96,.41,.34);
  vec3 cRose=vec3(.55,.34,.47), cZen=vec3(.13,.17,.35);
  vec3 s=mix(cGold,cCoral,smoothstep(0.,.10,g));
  s=mix(s,cRose,smoothstep(.07,.30,g));
  s=mix(s,cZen,smoothstep(.22,.72,g));
  float sd=max(0.,dot(rd,sun));
  s+=vec3(.90,.34,.12)*pow(sd,4.)*.55;
  s+=vec3(1.10,.52,.20)*pow(sd,18.)*1.10;
  s+=vec3(1.20,.72,.34)*pow(sd,120.)*2.2;
  s+=vec3(1.,.92,.78)*pow(sd,1400.)*16.;            // solar disc
  float az=dot(normalize(vec2(rd.x,rd.z)+1e-5),normalize(vec2(sun.x,sun.z)));
  float band=exp(-g*11.)*(.45+.55*smoothstep(-.2,1.,az));
  s+=vec3(1.05,.46,.18)*band*.5;                    // horizon afterglow
  if(rd.y>.03){vec2 cp=rd.xz/rd.y*2.;float cf=smoothstep(.03,.18,rd.y);
    vec3 cw=vec3(1.05,.62,.42), cc=vec3(.30,.26,.42);
    vec3 cl=mix(cc,cw,clamp(az*.5+.5,0.,1.));
    s=mix(s,cl,smoothstep(.42,.70,fb(cp+vec2(t*.006,t*.003)))*.32*cf);
    s=mix(s,cw,smoothstep(.50,.74,fb(cp*2.+vec2(-t*.010,t*.005)))*.16*cf);}
  return s;
}

// Ocean surface: Fresnel + absorption + warm sunset glitter
vec3 shade(vec3 N,vec3 rd,vec3 sun,float dist,float t){
  float ci=max(0.,dot(N,-rd));
  float fr=R0+(1.-R0)*pow(1.-ci,5.);                // Schlick Fresnel
  float depth=1.5/max(.08,ci);
  vec3 wc=exp(-AL*depth)*vec3(.01,.06,.08)+vec3(.004,.022,.032)*depth*.2;
  float st=1.-N.y;                                   // Z₂ bubble glow ∝ steepness²·Ω
  wc+=exp(-AL*.3)*vec3(.02,.12,.14)*min(1.,st*st*OM*.6);
  wc+=vec3(.06,.035,.014)*pow(max(0.,dot(rd,sun)),2.)*pow(1.-ci,2.)*.45; // warm underlight
  wc+=vec3(.005,.012,.016)*smoothstep(20.,3.,dist)*ci;
  vec3 rf=reflect(rd,N),rc=skyC(rf,sun,t);           // reflection carries the sky's orange
  float sr=max(0.,dot(rf,sun));
  rc+=vec3(1.25,.62,.24)*pow(sr,250.)*11.;           // sharp sun core on the water
  rc+=vec3(1.05,.50,.22)*pow(sr,22.)*1.8;            // broad shimmering glitter road
  rc+=vec3(.90,.42,.20)*pow(sr,6.)*.5;               // wide warm sheen
  return mix(wc,rc,fr);
}

void main(){
  vec2 uv=(gl_FragCoord.xy-.5*R)/R.y;
  float t=T;
  vec3 ro=vec3(0.,3.5*ZM,0.),fw=normalize(vec3(-20.*ZM,.5+.5*(ZM-1.),2.)-ro);
  vec3 ri=normalize(cross(fw,vec3(0,1,0))),up=cross(ri,fw);
  vec3 rd=normalize(fw+uv.x*ri*1.15+uv.y*up);
  vec3 sun=normalize(vec3(-.55,SH,-.40));            // sun height SH driven from JS (gentle sunset)
  vec3 sky=skyC(rd,sun,t),col=sky;

  if(rd.y<.05){
    // Analytical distant ocean (no raymarch cost)
    float tF=max(.1,-ro.y/min(-.0001,rd.y));
    vec3 aO=shade(vec3(0,1,0),rd,sun,min(tF,200.),t);
    vec2 fp=ro.xz+rd.xz*min(tF,150.);
    float tx=n2(fp*.25+vec2(-t*.2,t*.08))*.5+n2(fp*.6+vec2(t*.15,-t*.1))*.3;
    aO+=vec3(.70,.34,.14)*pow(max(0.,dot(rd,sun)),3.)*(tx*.12+.04); // distant warm sheen
    aO+=vec3(-.005,.003,.006)*(tx-.4)*.15;
    col=rd.y<0.?aO:mix(aO,sky,smoothstep(0.,.03,rd.y));

    // Raymarch with LOD
    float tc=.5;bool hit=false;vec3 hp;
    for(int i=0;i<100;i++){
      vec3 p=ro+rd*tc;float lod=smoothstep(10.,80.,tc);
      float h=sea(p.xz,t,lod),d=p.y-h;
      if(d<.025){hit=true;hp=p;break;}
      tc+=max(.03+lod*.15,d*.35);if(tc>150.)break;}

    if(hit){
      float dist=length(hp-ro),lod=smoothstep(10.,80.,dist),e=.05+lod*.1;
      float hc=sea(hp.xz,t,lod);
      float hx=sea(hp.xz+vec2(e,0),t,lod),hnx=sea(hp.xz-vec2(e,0),t,lod);
      float hz=sea(hp.xz+vec2(0,e),t,lod),hnz=sea(hp.xz-vec2(0,e),t,lod);
      vec3 N=normalize(vec3(hnx-hx,2.*e,hnz-hz));
      vec3 ocean=shade(N,rd,sun,dist,t);

      // ── Seabed ── visibility governed by α_eff = α·(0.2 + 0.8·Ω)
      {vec3 rr=refract(rd,N,.75);              // Snell: η = 1/n
       float pl=8./max(.05,-rr.y);             // path to bed at y = −8
       vec3 tr=exp(-AL*(.2+.8*OM)*pl);         // CRR absorption kernel, Ω = turbidity
       vec2 bp=hp.xz+rr.xz*pl;

       // Sand with SO(2) ripple bedforms
       float sa=.5+.2*n2(bp*.4)+.12*n2(bp*2.2)+.08*n2(bp*7.);
       float rip=sin(bp.x*2.5+bp.y*.8+sin(bp.y*1.2)*.6)*.5+.5;
       rip*=.5+.5*sin(bp.x*5.+bp.y*1.5+sin(bp.x*2.)*.4);
       sa+=.08*rip+.04*sin(bp.x*8.+bp.y*2.5);
       vec3 bed=vec3(sa*.55,sa*.48,sa*.3);

       // Caustics — intensity ∝ 1/Ω (calm surface = coherent lens)
       float ca=n2(bp*3.+vec2(-t*.4,t*.25))+n2(bp*5.5+vec2(t*.6,-t*.3));
       bed+=vec3(.4,.35,.2)*max(0.,ca-.7)/((.3+.7*OM))*max(0.,N.y)*max(0.,dot(vec3(0,1,0),sun));

       // Coral — morphology = Ω (low = dome, high = branching)
       for(int i=0;i<8;i++){float ci=float(i);
         float om=i<3?.6:i<6?1.2:2.;
         vec2 cp=vec2(mod(ci*14.3+3.,40.)-20.,mod(ci*9.7+6.,16.)-8.);
         vec2 cd=bp-cp;
         cd.x*=1./(om*.7+.3);                  // high Ω elongates
         float r=length(cd),mask=smoothstep(1.8*om,.1,r);
         float tex=n2(cd*6./om+ci*4.)+.5*n2(cd*14./om+ci*7.)+.25*n2(cd*28./om);
         tex=max(0.,tex-.4)*mask;
         vec3 cc=i<3?vec3(.6,.18,.22):i<6?vec3(.65,.32,.1):vec3(.5,.18,.5);
         cc+=vec3(.18,.1,.05)*sin(cd.x*12.+cd.y*8.);
         bed=mix(bed,cc,.6*tex);}

       // Seaweed — Ω gradient root→tip; sway ∝ distance from anchor
       float sw=0.;
       for(int i=0;i<10;i++){float si=float(i);
         vec2 anch=vec2(mod(si*17.3+5.,50.)-25.,mod(si*13.1+8.,20.)-10.);
         vec2 off=bp-anch;float dst=length(off);
         off+=vec2(1.,.6)*dst*.25*sin(t*1.2+si*1.9);
         off+=vec2(.5,-.8)*dst*.12*sin(t*1.7+si*3.1);
         sw+=smoothstep(2.8,.2,length(off))*max(0.,n2(off*3.+vec2(si*5.,si*3.))-.25);}
       bed=mix(bed,vec3(.04,.14,.04),.5*min(1.,sw));

       // Fish — body = exp(−C²/Ω), size/speed/freq all scale with Ω
       float fsh=0.;
       for(int i=0;i<40;i++){float fi=float(i);
         float sc=i<4?2.5:i<12?1.:i<24?.5:.25; // four Ω-classes
         float sp=.55/sc;                        // drift ∝ 1/Ω
         float wf=4.5/sc;                        // tail freq ∝ 1/Ω
         float wx=4./(sc*sc),wy=90./(sc*sc);    // envelope width ∝ Ω²
         vec2 fc=vec2(mod(fi*11.7+t*sp+30.,60.)-45.,mod(fi*7.3+fi*fi*.3+t*sp*.18+10.,24.)-12.);
         vec2 dd=bp-fc;float ha=(.15/sc)*sin(fi*.7+t*.18*sp);
         float ch=cos(ha),sh2=sin(ha);
         vec2 r=vec2(dd.x*ch+dd.y*sh2,-dd.x*sh2+dd.y*ch);
         r.y+=(.06*sc)*max(0.,r.x)*sin(r.x*wf+t*wf+fi*2.1); // SO(2) tail
         fsh+=.7*sc*exp(-r.x*r.x*wx-r.y*r.y*wy);}
       bed*=1.-.4*min(1.,fsh);

       float fr0=R0+(1.-R0)*pow(1.-max(0.,dot(N,-rd)),5.);
       ocean+=bed*tr*(1.-fr0);}

      // Whitecap — C·Ω ≥ 1: slope (coherence) × Ω = rupture → foam (warm-lit at sunset)
      float fs=max(0.,-(hnx-hx)/(2.*e));
      float wc=smoothstep(.8,1.2,fs*OM)*smoothstep(-.1,.3,hc);
      wc*=.5+.3*n2(hp.xz*8.+vec2(t*.3,-t*.2))+.2*n2(hp.xz*25.+vec2(-t*.5,t*.4));
      ocean=mix(ocean,vec3(.92,.86,.78)+vec3(.10,.06,.02)*max(0.,dot(N,sun)),wc*.85);
      col=mix(ocean,aO,lod);}
  }

  // Vignette + warm tonemap
  vec2 v=gl_FragCoord.xy/R;
  col*=.45+.55*smoothstep(0.,.4,v.x)*smoothstep(1.,.6,v.x)*smoothstep(0.,.25,v.y)*smoothstep(1.,.75,v.y);
  col=col/(col+vec3(.38,.40,.45));
  col=pow(col,vec3(.90,.96,1.02));   // lift reds, deepen blues — dusk warmth
  gl_FragColor=vec4(col,1.);
}`;

  function mk(src, type) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  }
  const pg = gl.createProgram();
  gl.attachShader(pg, mk(VS, gl.VERTEX_SHADER));
  gl.attachShader(pg, mk(FS, gl.FRAGMENT_SHADER));
  gl.linkProgram(pg);
  if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(pg));
    gl.clearColor(0.82, 0.44, 0.27, 1.0);   // warm sunset wash so the panel is never blank
    gl.clear(gl.COLOR_BUFFER_BIT);
    return;
  }
  gl.useProgram(pg);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const al = gl.getAttribLocation(pg, 'a');
  gl.enableVertexAttribArray(al);
  gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);

  const uR = gl.getUniformLocation(pg, 'R');
  const uT = gl.getUniformLocation(pg, 'T');
  const uOM = gl.getUniformLocation(pg, 'OM');
  const uZM = gl.getUniformLocation(pg, 'ZM');
  const uSH = gl.getUniformLocation(pg, 'SH');

  const OMEGA = 0.5;             // §CRR Ω — calm sea, gentle swell (the slider's "calm/gentle")
  const ZOOM = 1.62;            // fixed framing for the panel (no zoom control here)
  const dprCap = Math.min(window.devicePixelRatio || 1, 1.5);
  let bw = 0, bh = 0;
  function size() {
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width  > 0 ? rect.width  : parseInt(canvas.getAttribute('width'));
    const chh = rect.height > 0 ? rect.height : parseInt(canvas.getAttribute('height'));
    const w = Math.max(1, Math.round(cw * dprCap));
    const h = Math.max(1, Math.round(chh * dprCap));
    if (w !== bw || h !== bh) { bw = w; bh = h; canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }

  let t0 = performance.now() / 1000;
  function draw(now) {
    const elapsed = (now / 1000) - t0;
    size();
    // The sun gently lowers toward the horizon and eases back — a slow, seamless sunset.
    let s = 0.5 + 0.5 * Math.cos(elapsed * (TAU / 80));   // 1 (golden hour) → 0 (on the horizon) → 1, ~80 s
    s = Math.pow(s, 1.5);                                 // linger low: dwell at the sunset moment
    const sunH = 0.004 + 0.150 * s;
    gl.uniform2f(uR, bw, bh);
    gl.uniform1f(uT, elapsed * 0.42);    // gentle wave time
    gl.uniform1f(uOM, OMEGA);
    gl.uniform1f(uZM, ZOOM);
    gl.uniform1f(uSH, sunH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    scheduleNext(canvas, draw);
  }
  registerCanvas(canvas);
  requestAnimationFrame(draw);
}

/* 2D sunset fallback — used only when WebGL is unavailable, so the panel still
 * glows with a descending sun and a shimmering reflection rather than sitting blank. */
function renderAestheticsFallback(canvas) {
  const cssW = parseInt(canvas.getAttribute('width'));
  const cssH = parseInt(canvas.getAttribute('height'));
  const { ctx, W, H } = setupCanvas(canvas, cssW, cssH);
  const horizonY = H * 0.52, sunX = W * 0.64;
  let t0 = performance.now() / 1000;
  function draw(now) {
    const t = (now / 1000) - t0;
    const s = Math.pow(0.5 + 0.5 * Math.cos(t * (TAU / 80)), 1.5);
    const sunY = horizonY - H * 0.03 - s * H * 0.30;     // sun descends toward the horizon

    ctx.clearRect(0, 0, W, H);
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0.00, rgba([34, 40, 78], 1));
    sky.addColorStop(0.55, rgba([210, 96, 78], 1));
    sky.addColorStop(1.00, rgba([255, 168, 86], 1));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizonY + 1);

    const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.5);
    halo.addColorStop(0.00, rgba([255, 224, 170], 0.95));
    halo.addColorStop(0.18, rgba([255, 150, 70], 0.55));
    halo.addColorStop(1.00, rgba([255, 150, 70], 0));
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, horizonY + H * 0.12);
    ctx.beginPath(); ctx.arc(sunX, sunY, H * 0.055, 0, TAU);
    ctx.fillStyle = rgba([255, 238, 200], 0.98); ctx.fill();

    const sea = ctx.createLinearGradient(0, horizonY, 0, H);
    sea.addColorStop(0.00, rgba([200, 96, 64], 0.85));
    sea.addColorStop(0.22, rgba([70, 112, 120], 1));
    sea.addColorStop(1.00, rgba([18, 40, 54], 1));
    ctx.fillStyle = sea; ctx.fillRect(0, horizonY, W, H - horizonY);

    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 26; i++) {
      const p = i / 26;
      const y = horizonY + (H - horizonY) * p;
      const spread = H * 0.02 * (0.4 + p * 5);
      const jx = Math.sin(t * 1.6 + i * 1.7) * spread;
      const a = (0.5 - p * 0.4) * (0.6 + 0.4 * Math.sin(t * 3 + i));
      ctx.fillStyle = rgba([255, 180, 96], Math.max(0, a) * 0.5);
      ctx.fillRect(sunX + jx - spread * 0.5, y, spread, 2 + p * 2);
    }
    ctx.restore();
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
