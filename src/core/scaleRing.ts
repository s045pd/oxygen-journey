/**
 * Oxygen Journey — right-edge stage / scale clock.
 *
 * A compact curved rail (arc of a large circle whose centre sits off-screen right):
 *  - stage ticks + glowing progress arc (where you are in the journey)
 *  - spring-eased needle carrying the level's scale label ("×10³ ALVEOLI"), which
 *    decodes in character-by-character on change
 *  - seven magnification pips under the label (10⁰ … 10⁶)
 * Styling comes from style.css (.scale-ring-host, .ring-*); accent via [data-accent].
 */
import type { AccentName } from '../types';

const NS = 'http://www.w3.org/2000/svg';
const GLYPHS = '0123456789×#/<>+·';
const POWER_PIPS = 7;
const DECODE_MS = 560;
const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

export interface ScaleRingOptions {
  /** Number of stage ticks (default 10). */
  stages?: number;
  /** Tiny end captions [top, bottom] (hidden on phones by CSS). */
  ends?: [string, string];
  accent?: AccentName;
  initialLabel?: string;
  initialT?: number;
  initialPower?: number;
}

export interface ScaleRing {
  readonly host: HTMLElement;
  /** Move the needle to t (0 = top / first stage, 1 = bottom / last stage) and set its label. */
  setScale(label: string, t: number, instant?: boolean): void;
  /** Light magnification pips 0..6 (power of ten). */
  setPower(power: number): void;
  setAccent(accent: AccentName | null): void;
  setStages(count: number): void;
  dispose(): void;
}

let activeRing: ScaleRing | null = null;

/** Convenience: drive the most recently mounted ring. */
export function setScale(label: string, t: number, instant = false): void {
  activeRing?.setScale(label, t, instant);
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.appendChild(el);
  return el;
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const f2 = (v: number): string => v.toFixed(2);

/** "x1e3" → "×10³", "x10" → "×10"; anything else passes through. */
function normalisePow(tok: string): string {
  const sci = /^[x×]1e(\d)$/i.exec(tok);
  if (sci) return `×10${SUPERSCRIPT[Number(sci[1])] ?? ''}`;
  return tok.replace(/^x/i, '×');
}

function splitLabel(text: string): { pow: string; name: string } {
  const s = text.trim();
  const m = /^([x×][0-9e⁰¹²³⁴⁵⁶⁷⁸⁹]+)\s+(.+)$/iu.exec(s);
  return m ? { pow: normalisePow(m[1]), name: m[2] } : { pow: '', name: s };
}

function scramble(target: string, p: number): string {
  if (p >= 1) return target;
  const chars = Array.from(target);
  const shown = Math.floor(clamp(p, 0, 1) * chars.length);
  let out = '';
  chars.forEach((ch, i) => {
    out += i < shown || ch === ' ' || ch === '\u00a0' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
  });
  return out;
}

export function mountScaleRing(el: HTMLElement, options: ScaleRingOptions = {}): ScaleRing {
  let stages = Math.max(2, options.stages ?? 10);
  const ends = options.ends ?? ['I', 'X'];

  const ownsHost = !el.classList.contains('scale-ring-host');
  const host: HTMLElement = ownsHost ? document.createElement('div') : el;
  if (ownsHost) {
    host.className = 'scale-ring-host';
    el.appendChild(host);
  }
  host.setAttribute('role', 'img');
  if (options.accent) host.dataset.accent = options.accent;

  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  /* ---- SVG skeleton ---- */
  const svg = svgEl('svg', { 'aria-hidden': 'true', focusable: 'false' });
  host.appendChild(svg);

  const gMinor = svgEl('g', { class: 'ring-minor' }, svg);
  const track = svgEl('path', { class: 'ring-track' }, svg);
  const progress = svgEl('path', { class: 'ring-progress', pathLength: 1 }, svg);
  progress.style.strokeDasharray = '1 2';
  progress.style.transition = 'none';
  const gTicks = svgEl('g', {}, svg);
  const gEnds = svgEl('g', {}, svg);

  const needle = svgEl('g', { class: 'ring-needle' }, svg);
  const halo = svgEl('circle', { class: 'ring-halo', r: 9 }, needle);
  const arm = svgEl('line', { class: 'ring-arm' }, needle);
  const headDot = svgEl('circle', { class: 'ring-head', r: 4.2 }, needle);
  const label = svgEl('text', { class: 'ring-label is-active' }, needle);
  const powSpan = svgEl('tspan', { class: 'ring-pow' }, label);
  const nameSpan = svgEl('tspan', { class: 'ring-name' }, label);
  const gPips = svgEl('g', { class: 'ring-pips' }, needle);
  const pips: SVGRectElement[] = [];
  for (let k = 0; k < POWER_PIPS; k++) {
    pips.push(svgEl('rect', { class: 'ring-pip', width: 4, height: 4, rx: 1 }, gPips));
  }

  /* ---- Geometry state ---- */
  const geo = { w: 0, h: 0, cx: 0, cy: 0, R: 1, alpha: 0.5 };
  let tickEls: SVGCircleElement[] = [];
  let lastActive = -1;

  const point = (t: number): { x: number; y: number; nx: number; ny: number } => {
    const phi = Math.PI + geo.alpha - 2 * geo.alpha * t;
    const nx = Math.cos(phi);
    const ny = Math.sin(phi);
    return { x: geo.cx + geo.R * nx, y: geo.cy + geo.R * ny, nx, ny };
  };

  /* ---- Needle + decode animation state ---- */
  let cur = clamp(options.initialT ?? 0, 0, 1);
  let vel = 0;
  let target = cur;
  let raf = 0;
  let last = 0;
  let decodeT = 1;
  let parts = { pow: '', name: '' };
  const K = 70;
  const C = 2 * Math.sqrt(K) * 0.72;

  const buildTicks = (): void => {
    gTicks.replaceChildren();
    tickEls = [];
    lastActive = -1;
    for (let k = 0; k < stages; k++) {
      const p = point(k / (stages - 1));
      tickEls.push(svgEl('circle', { class: 'ring-tick', cx: f2(p.x), cy: f2(p.y), r: 2.4 }, gTicks));
    }
  };

  const renderLabel = (p: number): void => {
    const powP = clamp(p * 1.5, 0, 1);
    const nameP = clamp((p - 0.12) / 0.88, 0, 1);
    powSpan.textContent = scramble(parts.pow, powP);
    nameSpan.textContent = (parts.pow ? '\u00a0' : '') + scramble(parts.name, nameP);
    label.style.opacity = String(0.35 + 0.65 * Math.min(1, p * 1.6));
  };

  function pose(x: number): void {
    if (!geo.w) return;
    const xx = clamp(x, -0.03, 1.03);
    const p = point(xx);

    halo.setAttribute('cx', f2(p.x));
    halo.setAttribute('cy', f2(p.y));
    headDot.setAttribute('cx', f2(p.x));
    headDot.setAttribute('cy', f2(p.y));
    arm.setAttribute('x1', f2(p.x + p.nx * 5));
    arm.setAttribute('y1', f2(p.y + p.ny * 5));
    arm.setAttribute('x2', f2(p.x + p.nx * 14));
    arm.setAttribute('y2', f2(p.y + p.ny * 14));
    const lx = p.x + p.nx * 18;
    const ly = clamp(p.y + p.ny * 18, 8, geo.h - 14);
    label.setAttribute('x', f2(lx));
    label.setAttribute('y', f2(ly));
    for (let k = 0; k < POWER_PIPS; k++) {
      pips[k].setAttribute('x', f2(lx - (POWER_PIPS - 1 - k) * 5 - 3));
      pips[k].setAttribute('y', f2(ly + 7));
    }

    progress.style.strokeDashoffset = String(1 - clamp(x, 0, 1));

    const active = Math.round(clamp(x, 0, 1) * (stages - 1));
    if (active !== lastActive) {
      lastActive = active;
      tickEls.forEach((t, k) => {
        t.classList.toggle('is-active', k === active);
        t.classList.toggle('is-done', k < active);
        t.setAttribute('r', k === active ? '4.2' : '2.4');
      });
    }
  }

  const layout = (w: number, h: number): void => {
    if (w < 4 || h < 20) return;
    geo.w = w;
    geo.h = h;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const pad = 10;
    const chord = h - pad * 2;
    const sag = Math.min(w * 0.48, 28);
    const R = (chord * chord) / 4 / (2 * sag) + sag / 2;
    const xR = w - 5;
    geo.R = R;
    geo.alpha = Math.asin(clamp(chord / 2 / R, -1, 1));
    geo.cx = xR - sag + R;
    geo.cy = h / 2;

    const p0 = point(0);
    const p1 = point(1);
    const d = `M${f2(p0.x)} ${f2(p0.y)} A${f2(R)} ${f2(R)} 0 0 0 ${f2(p1.x)} ${f2(p1.y)}`;
    track.setAttribute('d', d);
    progress.setAttribute('d', d);

    gMinor.replaceChildren();
    const minor = 36;
    for (let i = 0; i <= minor; i++) {
      const p = point(i / minor);
      const len = i % 4 === 0 ? 5 : 2.5;
      svgEl(
        'line',
        {
          x1: f2(p.x + p.nx * 2),
          y1: f2(p.y + p.ny * 2),
          x2: f2(p.x + p.nx * (2 + len)),
          y2: f2(p.y + p.ny * (2 + len)),
        },
        gMinor,
      );
    }

    buildTicks();

    gEnds.replaceChildren();
    ends.forEach((txt, i) => {
      const p = point(i);
      const t = svgEl('text', { class: 'ring-label ring-end', x: f2(p.x - 9), y: f2(p.y) }, gEnds);
      t.textContent = txt;
    });

    pose(cur);
  };

  const tick = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    let alive = false;

    const a = K * (target - cur) - C * vel;
    vel += a * dt;
    cur += vel * dt;
    if (Math.abs(target - cur) < 1e-4 && Math.abs(vel) < 1e-4) {
      cur = target;
      vel = 0;
    } else {
      alive = true;
    }

    if (decodeT < 1) {
      decodeT = Math.min(1, decodeT + (dt * 1000) / DECODE_MS);
      renderLabel(decodeT);
      if (decodeT < 1) alive = true;
    }

    pose(cur);
    raf = alive ? requestAnimationFrame(tick) : 0;
  };

  const kick = (): void => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  /* ---- Resize ---- */
  const measure = (): void => {
    const r = host.getBoundingClientRect();
    layout(Math.round(r.width), Math.round(r.height));
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
  ro?.observe(host);
  window.addEventListener('resize', measure);
  measure();

  let currentLabel: string | null = null;

  const ring: ScaleRing = {
    host,

    setScale(text, t, instant = false) {
      const nt = clamp(Number.isFinite(t) ? t : 0, 0, 1);
      if (text !== currentLabel) {
        currentLabel = text;
        parts = splitLabel(text);
        host.setAttribute('aria-label', `Scale: ${parts.pow} ${parts.name}`.trim());
        if (instant || reduceMotion) {
          decodeT = 1;
          renderLabel(1);
        } else {
          decodeT = 0;
          renderLabel(0);
        }
      }
      target = nt;
      if (instant || reduceMotion) {
        cur = nt;
        vel = 0;
        pose(cur);
      }
      if (decodeT < 1 || Math.abs(target - cur) > 1e-4) kick();
    },

    setPower(power) {
      const p = clamp(Math.round(Number.isFinite(power) ? power : 0), 0, POWER_PIPS - 1);
      pips.forEach((pip, k) => pip.classList.toggle('is-on', k <= p));
    },

    setAccent(accent) {
      if (accent) host.dataset.accent = accent;
      else delete host.dataset.accent;
    },

    setStages(count) {
      stages = Math.max(2, Math.round(count));
      if (geo.w) {
        buildTicks();
        pose(cur);
      }
    },

    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      svg.remove();
      if (ownsHost) host.remove();
      if (activeRing === ring) activeRing = null;
    },
  };

  ring.setScale(options.initialLabel ?? '', cur, true);
  ring.setPower(options.initialPower ?? 0);
  activeRing = ring;
  return ring;
}