/**
 * Oxygen Journey — compact lesson HUD (SkillBay studio skin, `sb-` namespace).
 *
 * Phone budget at 390×844 (≤ ~40% overlay):
 *  - Header (~7%): roman + title, 10-segment stage bar, Tour / Try / Check chips; nav top-right.
 *  - Bottom card (≤ ~26%): kicker, one short beat (3-line clamp), readout, control pill + Check,
 *    optional inline extra slider.
 *  - Splash / finish: bottom-anchored panel over a transparent-top gradient so the stage shows.
 *
 * The HUD never touches the 3D scene. Everything flows out through callbacks.
 */
import type { ControlKind, ExtraSliderDef, LevelDef, LevelPhase, Readout, ReadoutSpec } from '../types';
import { PHASE_ORDER } from '../types';
import { COPY } from '../content/levels';

export interface DragInfo {
  phase: 'start' | 'move' | 'end';
  /** Delta since the previous drag event, in CSS pixels. */
  dx: number;
  dy: number;
  /** Pointer position in normalised device coordinates (-1..1, +y up). */
  x: number;
  y: number;
}

export interface HudCallbacks {
  onStart?(): void;
  onRestart?(): void;
  onCheck?(): void;
  onNext?(): void;
  onPrev?(): void;
  onHoldStart?(): void;
  onHoldEnd?(): void;
  onTap?(): void;
  onSlider?(v: number): void;
  onExtraSlider?(v: number): void;
  onDrag?(e: DragInfo): void;
  onSkipTour?(): void;
  onTourAdvance?(): void;
  /** Quick click/tap on the 3D stage (no drag). */
  onSurfaceTap?(): void;
  onMute?(muted: boolean): void;
}

const ICON = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
  sound:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a7.6 7.6 0 0 1 0 11"/></svg>',
  muted:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  drag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8 4 12l4 4M16 8l4 4-4 4M4 12h16"/></svg>',
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: Element): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

function iconButton(cls: string, svg: string, label: string, parent: Element, onClick: () => void): HTMLButtonElement {
  const b = h('button', `sb-icon ${cls}`, parent);
  b.type = 'button';
  b.innerHTML = svg;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.addEventListener('click', () => {
    b.blur();
    onClick();
  });
  return b;
}

function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

interface RangeControl {
  wrap: HTMLDivElement;
  input: HTMLInputElement;
  set(v: number): void;
}

function makeRange(label: string, initial: number, inline: boolean, onInput: (v: number) => void): RangeControl {
  const wrap = h('div', inline ? 'sb-range is-inline' : 'sb-range');
  const lab = h('span', 'sb-range-label', wrap);
  lab.textContent = label;
  const input = h('input', 'sb-range-input', wrap);
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.001';
  input.setAttribute('aria-label', label);
  const out = h('output', 'sb-range-val', wrap);

  const paint = (v: number): void => {
    input.style.setProperty('--v', v.toFixed(4));
    out.textContent = `${Math.round(v * 100)}%`;
  };
  const set = (v: number): void => {
    const c = clamp01(v);
    input.value = String(c);
    paint(c);
  };
  input.addEventListener('input', () => {
    const v = clamp01(parseFloat(input.value) || 0);
    paint(v);
    onInput(v);
  });
  set(initial);
  return { wrap, input, set };
}

export class HUD {
  readonly root: HTMLDivElement;
  private readonly cb: HudCallbacks;
  private readonly surface: HTMLElement;
  private readonly host: HTMLElement;

  // Header
  private readonly roman: HTMLSpanElement;
  private readonly titleEl: HTMLSpanElement;
  private readonly segs: HTMLDivElement;
  private readonly chips: Record<LevelPhase, HTMLSpanElement>;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly muteBtn: HTMLButtonElement;

  // Card
  private readonly card: HTMLElement;
  private readonly kicker: HTMLSpanElement;
  private readonly beats: HTMLSpanElement;
  private readonly text: HTMLParagraphElement;
  private readonly tourFill: HTMLElement;
  private readonly readoutEl: HTMLDivElement;
  private readonly roLabel: HTMLSpanElement;
  private readonly roNote: HTMLSpanElement;
  private readonly roNum: HTMLElement;
  private readonly roUnit: HTMLElement;
  private readonly roFill: HTMLElement;
  private readonly roTarget: HTMLElement;
  private readonly controlHost: HTMLDivElement;
  private readonly checkBtn: HTMLButtonElement;
  private readonly extraHost: HTMLDivElement;

  // Splash
  private readonly splash: HTMLDivElement;
  private readonly splashInner: HTMLDivElement;
  private startBtn: HTMLButtonElement | null = null;

  // State
  private spec: ReadoutSpec | null = null;
  private kind: ControlKind = 'hold';
  private phase: LevelPhase = 'tour';
  private actBtn: HTMLButtonElement | null = null;
  private dragHint: HTMLDivElement | null = null;
  private slider: RangeControl | null = null;
  private extra: RangeControl | null = null;
  private holdPointer: number | null = null;
  private holdVisual = false;
  private checkReady = false;
  private muted = false;
  private loading = true;
  private lastText = '';
  private ro = { num: '', unit: '', label: '', note: '', status: '', fill: '', act: '' };

  // Surface drag
  private dragId: number | null = null;
  private dragX = 0;
  private dragY = 0;
  private dragMoved = 0;
  private dragT0 = 0;

  constructor(parent: HTMLElement, dragSurface: HTMLElement, callbacks: HudCallbacks = {}) {
    this.cb = callbacks;
    this.surface = dragSurface;
    this.host = parent;

    const root = h('div', 'sb-hud is-splash', parent);
    root.dataset.phase = 'tour';
    root.dataset.kind = 'hold';
    this.root = root;
    parent.classList.add('sb-splashing');
    h('div', 'sb-vignette', root);

    /* ---- Header ---- */
    const top = h('header', 'sb-top', root);
    const id = h('div', 'sb-id', top);
    const brand = h('div', 'sb-brand', id);
    brand.textContent = COPY.appKicker;
    const title = h('div', 'sb-title', id);
    this.roman = h('span', 'sb-roman', title);
    this.titleEl = h('span', 'sb-name', title);
    const meta = h('div', 'sb-meta', id);
    this.segs = h('div', 'sb-segs', meta);
    this.segs.setAttribute('aria-hidden', 'true');
    const phases = h('div', 'sb-phases', meta);
    const mkChip = (p: LevelPhase): HTMLSpanElement => {
      const s = h('span', '', phases);
      s.textContent = COPY.phaseLabels[p];
      return s;
    };
    this.chips = { tour: mkChip('tour'), handsOn: mkChip('handsOn'), check: mkChip('check') };

    const nav = h('nav', 'sb-nav', top);
    this.prevBtn = iconButton('sb-prev', ICON.prev, COPY.back, nav, () => this.cb.onPrev?.());
    this.nextBtn = iconButton('sb-next', ICON.next, COPY.next, nav, () => this.cb.onNext?.());
    this.muteBtn = iconButton('sb-mute', ICON.sound, 'Mute sound', nav, () => {
      this.setMuted(!this.muted);
      this.cb.onMute?.(this.muted);
    });

    /* ---- Card ---- */
    const card = h('section', 'sb-card', root);
    card.setAttribute('aria-label', 'Lesson panel');
    this.card = card;
    const head = h('div', 'sb-card-head', card);
    this.kicker = h('span', 'sb-kicker', head);
    this.beats = h('span', 'sb-beats sb-tour-only', head);
    const keyHint = h('span', 'sb-keyhint sb-tour-only', head);
    keyHint.textContent = COPY.tourKeyHint;
    const skip = h('button', 'sb-skip sb-tour-only', head);
    skip.type = 'button';
    skip.textContent = `${COPY.tryIt} ›`;
    skip.addEventListener('click', () => {
      skip.blur();
      this.cb.onSkipTour?.();
    });

    this.text = h('p', 'sb-text', card);
    this.text.setAttribute('aria-live', 'polite');
    this.text.addEventListener('click', () => {
      if (this.phase === 'tour') this.cb.onTourAdvance?.();
    });

    const tourBar = h('div', 'sb-tourbar sb-tour-only', card);
    this.tourFill = h('i', '', tourBar);

    const ro = h('div', 'sb-readout sb-try-only', card);
    this.readoutEl = ro;
    const row = h('div', 'sb-ro-row', ro);
    this.roLabel = h('span', 'sb-ro-label', row);
    this.roNote = h('span', 'sb-ro-note', row);
    const val = h('span', 'sb-ro-value', row);
    this.roNum = h('b', '', val);
    this.roUnit = h('small', '', val);
    const bar = h('div', 'sb-ro-bar', ro);
    this.roFill = h('i', '', bar);
    this.roTarget = h('em', '', bar);

    const ctrlRow = h('div', 'sb-ctrl-row sb-try-only', card);
    this.controlHost = h('div', 'sb-control', ctrlRow);
    this.checkBtn = h('button', 'sb-check', ctrlRow);
    this.checkBtn.type = 'button';
    const checkLabel = h('span', '', this.checkBtn);
    checkLabel.textContent = COPY.check;
    this.checkBtn.insertAdjacentHTML('beforeend', ICON.arrow);
    this.checkBtn.disabled = true;
    this.checkBtn.addEventListener('click', () => {
      this.checkBtn.blur();
      if (this.checkReady) this.cb.onCheck?.();
    });

    this.extraHost = h('div', 'sb-extra sb-try-only', card);

    /* ---- Splash ---- */
    this.splash = h('div', 'sb-splash', root);
    this.splashInner = h('div', 'sb-splash-inner', this.splash);
    this.buildIntro();

    /* ---- Stage drag surface ---- */
    dragSurface.addEventListener('pointerdown', this.onSurfaceDown);
    dragSurface.addEventListener('pointermove', this.onSurfaceMove);
    dragSurface.addEventListener('pointerup', this.onSurfaceUp);
    dragSurface.addEventListener('pointercancel', this.onSurfaceUp);
    dragSurface.addEventListener('contextmenu', this.preventDefault);
  }

  /* ======================================================================= */
  /* Level / phase                                                           */
  /* ======================================================================= */

  setLevel(def: LevelDef, index: number, total: number): void {
    this.spec = def.readout;
    this.root.dataset.level = def.id;
    this.roman.textContent = def.roman;
    this.titleEl.textContent = def.title;
    this.card.setAttribute('aria-label', `${def.roman}. ${def.title}`);

    const s = def.readout;
    const span = s.max - s.min || 1;
    this.roTarget.style.left = `${(clamp01((s.target - s.min) / span) * 100).toFixed(2)}%`;
    this.ro = { num: '', unit: '', label: '', note: '', status: '', fill: '', act: '' };

    this.buildExtra(def.extraSlider);
    this.setControl(def.controlKind, def.controlLabel);
    this.setReadout({ label: s.label, value: s.min, unit: s.unit, progress: 0, status: 'idle' });
    this.checkReady = true; // force the toggle below to apply
    this.setCheckReady(false);
    this.card.classList.remove('is-success');
    this.setNav(index > 0, index < total);
  }

  setPhase(phase: LevelPhase): void {
    this.phase = phase;
    this.root.dataset.phase = phase;
    const at = PHASE_ORDER.indexOf(phase);
    PHASE_ORDER.forEach((p, i) => {
      this.chips[p].classList.toggle('is-on', i === at);
      this.chips[p].classList.toggle('is-past', i < at);
    });
    if (phase !== 'handsOn') this.releaseHold(true);
  }

  setProgress(index: number, done: readonly boolean[]): void {
    const total = done.length;
    if (this.segs.childElementCount !== total) {
      this.segs.replaceChildren();
      for (let i = 0; i < total; i++) h('i', '', this.segs);
    }
    Array.from(this.segs.children).forEach((seg, i) => {
      seg.classList.toggle('is-done', !!done[i] && i !== index);
      seg.classList.toggle('is-current', i === index);
    });
  }

  setNav(canPrev: boolean, canNext: boolean): void {
    this.prevBtn.disabled = !canPrev;
    this.nextBtn.disabled = !canNext;
  }

  setTour(text: string, beat: number, count: number): void {
    this.kicker.textContent = COPY.tourKicker;
    this.card.classList.remove('is-success');
    if (this.beats.childElementCount !== count) {
      this.beats.replaceChildren();
      for (let i = 0; i < count; i++) h('i', '', this.beats);
    }
    Array.from(this.beats.children).forEach((d, i) => d.classList.toggle('is-on', i <= beat));
    this.setText(text);
    this.setTourProgress(0);
  }

  setTourProgress(t: number): void {
    this.tourFill.style.transform = `scaleX(${clamp01(t).toFixed(3)})`;
  }

  setYourTurn(text: string, success = false): void {
    this.kicker.textContent = success ? COPY.successKicker : COPY.yourTurnKicker;
    this.card.classList.toggle('is-success', success);
    this.setText(text);
  }

  private setText(text: string): void {
    if (text === this.lastText) return;
    this.lastText = text;
    this.text.textContent = text;
    retrigger(this.text, 'is-swap');
  }

  /* ======================================================================= */
  /* Readout                                                                 */
  /* ======================================================================= */

  setReadout(r: Readout): void {
    const decimals = this.spec?.decimals ?? 0;
    const num = Number.isFinite(r.value) ? r.value.toFixed(decimals) : '–';
    if (num !== this.ro.num) this.roNum.textContent = this.ro.num = num;
    if (r.unit !== this.ro.unit) this.roUnit.textContent = this.ro.unit = r.unit;
    if (r.label !== this.ro.label) this.roLabel.textContent = this.ro.label = r.label;
    const note = r.note ?? '';
    if (note !== this.ro.note) this.roNote.textContent = this.ro.note = note;
    if (r.status !== this.ro.status) {
      this.ro.status = r.status;
      this.readoutEl.dataset.status = r.status;
    }
    const p = clamp01(r.progress).toFixed(3);
    const fill = `scaleX(${p})`;
    if (fill !== this.ro.fill) this.roFill.style.transform = this.ro.fill = fill;
    if (this.actBtn && p !== this.ro.act) {
      this.ro.act = p;
      this.actBtn.style.setProperty('--p', p);
    }
  }

  setCheckReady(ready: boolean): void {
    if (ready === this.checkReady) return;
    this.checkReady = ready;
    this.checkBtn.disabled = !ready;
    this.checkBtn.classList.toggle('is-ready', ready);
  }

  /* ======================================================================= */
  /* Controls                                                                */
  /* ======================================================================= */

  setControl(kind: ControlKind, label: string): void {
    this.releaseHold(true);
    this.kind = kind;
    this.root.dataset.kind = kind;
    this.controlHost.replaceChildren();
    this.actBtn = null;
    this.dragHint = null;
    this.slider = null;

    if (kind === 'hold' || kind === 'tap') {
      const btn = h('button', `sb-act is-${kind}`, this.controlHost);
      btn.type = 'button';
      h('span', 'sb-act-ring', btn);
      const lab = h('span', 'sb-act-label', btn);
      lab.textContent = label;
      const key = h('span', 'sb-act-key', btn);
      key.textContent = 'SPACE';
      btn.setAttribute('aria-label', `${label} (Space)`);
      btn.addEventListener('contextmenu', this.preventDefault);
      if (kind === 'hold') this.bindHold(btn);
      else this.bindTap(btn);
      this.actBtn = btn;
    } else if (kind === 'slider') {
      this.slider = makeRange(label, 0, false, (v) => this.cb.onSlider?.(v));
      this.controlHost.appendChild(this.slider.wrap);
    } else {
      const hint = h('div', 'sb-draghint', this.controlHost);
      hint.innerHTML = ICON.drag;
      const lab = h('span', '', hint);
      lab.textContent = label;
      const sm = h('small', '', hint);
      sm.textContent = COPY.dragOnStage;
      this.dragHint = hint;
    }
  }

  private buildExtra(def?: ExtraSliderDef): void {
    this.extraHost.replaceChildren();
    this.extra = null;
    this.extraHost.hidden = !def;
    if (!def) return;
    this.extra = makeRange(def.label, def.initial ?? 0.5, true, (v) => this.cb.onExtraSlider?.(v));
    this.extraHost.appendChild(this.extra.wrap);
  }

  private bindHold(btn: HTMLButtonElement): void {
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (this.holdPointer !== null) return;
      this.holdPointer = e.pointerId;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported */
      }
      this.setHoldActive(true);
      this.cb.onHoldStart?.();
    });
    const end = (e: PointerEvent): void => {
      if (this.holdPointer !== e.pointerId) return;
      this.holdPointer = null;
      this.setHoldActive(false);
      this.cb.onHoldEnd?.();
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('lostpointercapture', end);
    // Keyboard: Enter held on the focused button (Space is handled globally by the app).
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.repeat || this.holdPointer !== null) return;
      e.preventDefault();
      e.stopPropagation();
      this.holdPointer = -1;
      this.setHoldActive(true);
      this.cb.onHoldStart?.();
    });
    btn.addEventListener('keyup', (e) => {
      if (e.key !== 'Enter' || this.holdPointer !== -1) return;
      this.holdPointer = null;
      this.setHoldActive(false);
      this.cb.onHoldEnd?.();
    });
  }

  private bindTap(btn: HTMLButtonElement): void {
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.flashTap();
      this.cb.onTap?.();
    });
    btn.addEventListener('click', (e) => {
      // Keyboard activation only (pointer taps already handled on pointerdown).
      if (e.detail === 0) {
        this.flashTap();
        this.cb.onTap?.();
      }
    });
  }

  private releaseHold(silent: boolean): void {
    if (this.holdPointer === null && !this.holdVisual) return;
    const wasHolding = this.holdPointer !== null;
    this.holdPointer = null;
    this.setHoldActive(false);
    if (wasHolding && !silent) this.cb.onHoldEnd?.();
  }

  /** Visual hold state (also used for keyboard Space holds). */
  setHoldActive(on: boolean): void {
    this.holdVisual = on;
    this.actBtn?.classList.toggle('is-held', on && this.kind === 'hold');
  }

  /** Visual tap pulse (also used for keyboard Space / stage taps). */
  flashTap(): void {
    if (this.actBtn && this.kind === 'tap') retrigger(this.actBtn, 'is-tapped');
  }

  setSliderValue(v: number): void {
    this.slider?.set(v);
  }

  setExtraValue(v: number): void {
    this.extra?.set(v);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.muteBtn.innerHTML = m ? ICON.muted : ICON.sound;
    const label = m ? 'Unmute sound' : 'Mute sound';
    this.muteBtn.setAttribute('aria-label', label);
    this.muteBtn.title = label;
  }

  /* ======================================================================= */
  /* Splash / finish                                                         */
  /* ======================================================================= */

  private splashTitle(el: HTMLElement, text: string): void {
    const h1 = h('h1', '', el);
    const [first, ...rest] = text.split(' ');
    h1.append(first, ' ');
    const accent = h('span', '', h1);
    accent.textContent = rest.join(' ');
  }

  private buildIntro(): void {
    const el = this.splashInner;
    el.replaceChildren();
    const brand = h('div', 'sb-brand', el);
    brand.textContent = COPY.appKicker;
    this.splashTitle(el, COPY.appTitle);
    const sub = h('p', 'sb-splash-sub', el);
    sub.textContent = COPY.splashSub;
    const hint = h('div', 'sb-splash-hint', el);
    hint.textContent = COPY.splashHint;
    const btn = h('button', 'sb-primary sb-start', el);
    btn.type = 'button';
    const lab = h('span', '', btn);
    btn.insertAdjacentHTML('beforeend', ICON.arrow);
    btn.addEventListener('click', () => {
      btn.blur();
      if (!this.loading) this.cb.onStart?.();
    });
    this.startBtn = btn;
    const keys = h('div', 'sb-splash-keys', el);
    keys.textContent = COPY.keysHint;
    this.applyLoading(lab);
  }

  private applyLoading(label?: HTMLElement): void {
    if (!this.startBtn) return;
    const lab = label ?? this.startBtn.querySelector('span');
    if (lab) lab.textContent = this.loading ? COPY.loading : COPY.start;
    this.startBtn.disabled = this.loading;
    this.startBtn.classList.toggle('is-loading', this.loading);
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
    this.applyLoading();
  }

  private setSplashOpen(open: boolean): void {
    this.splash.classList.toggle('is-hidden', !open);
    this.root.classList.toggle('is-splash', open);
    this.host.classList.toggle('sb-splashing', open);
  }

  showSplash(): void {
    this.buildIntro();
    this.setSplashOpen(true);
  }

  hideSplash(): void {
    this.setSplashOpen(false);
  }

  get splashVisible(): boolean {
    return !this.splash.classList.contains('is-hidden');
  }

  showFinish(correct: number, total: number): void {
    const el = this.splashInner;
    el.replaceChildren();
    const brand = h('div', 'sb-brand', el);
    brand.textContent = COPY.appKicker;
    this.splashTitle(el, COPY.finishTitle);
    const sub = h('p', 'sb-splash-sub', el);
    sub.textContent = COPY.finishSub;
    if (total > 0) {
      const score = h('div', 'sb-score', el);
      const b = h('b', '', score);
      b.textContent = `${correct}/${total}`;
      const s = h('span', '', score);
      s.textContent = COPY.scoreLabel;
    }
    const btn = h('button', 'sb-primary', el);
    btn.type = 'button';
    const lab = h('span', '', btn);
    lab.textContent = COPY.restart;
    btn.insertAdjacentHTML('beforeend', ICON.arrow);
    btn.addEventListener('click', () => {
      btn.blur();
      this.cb.onRestart?.();
    });
    this.startBtn = null;
    this.setSplashOpen(true);
  }

  /* ======================================================================= */
  /* Stage pointer                                                           */
  /* ======================================================================= */

  private readonly preventDefault = (e: Event): void => e.preventDefault();

  private ndc(e: PointerEvent): { x: number; y: number } {
    const r = this.surface.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1,
      y: -(((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1),
    };
  }

  private readonly onSurfaceDown = (e: PointerEvent): void => {
    if (this.dragId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.dragId = e.pointerId;
    this.dragX = e.clientX;
    this.dragY = e.clientY;
    this.dragMoved = 0;
    this.dragT0 = performance.now();
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported */
    }
    this.dragHint?.classList.add('is-active');
    this.cb.onDrag?.({ phase: 'start', dx: 0, dy: 0, ...this.ndc(e) });
  };

  private readonly onSurfaceMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragId) return;
    const dx = e.clientX - this.dragX;
    const dy = e.clientY - this.dragY;
    this.dragX = e.clientX;
    this.dragY = e.clientY;
    this.dragMoved += Math.abs(dx) + Math.abs(dy);
    if (dx !== 0 || dy !== 0) this.cb.onDrag?.({ phase: 'move', dx, dy, ...this.ndc(e) });
  };

  private readonly onSurfaceUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragId) return;
    this.dragId = null;
    this.dragHint?.classList.remove('is-active');
    this.cb.onDrag?.({ phase: 'end', dx: 0, dy: 0, ...this.ndc(e) });
    if (e.type === 'pointerup' && this.dragMoved < 8 && performance.now() - this.dragT0 < 450) {
      this.cb.onSurfaceTap?.();
    }
  };

  dispose(): void {
    this.surface.removeEventListener('pointerdown', this.onSurfaceDown);
    this.surface.removeEventListener('pointermove', this.onSurfaceMove);
    this.surface.removeEventListener('pointerup', this.onSurfaceUp);
    this.surface.removeEventListener('pointercancel', this.onSurfaceUp);
    this.surface.removeEventListener('contextmenu', this.preventDefault);
    this.host.classList.remove('sb-splashing');
    this.root.remove();
  }
}