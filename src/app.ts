/**
 * Oxygen Journey — application shell.
 *
 * Splash → for each stage: Tour (auto beats; Space / stage click / card click = next beat,
 * Enter or "Try it" = skip) → Try (hands-on) → Check (two-question quiz) → next stage → finish.
 *
 * Always renders with the active level's own camera (aspect + HUD-safe offset synced on
 * resize, on level change and defensively each frame). Stages without a working factory
 * fall back to the procedural glass torso, driven by the live controls.
 */
import * as THREE from 'three';
import { createRenderer, type StageRenderer } from './core/renderer';
import { createGlassTorso, type GlassTorso } from './core/body';
import { mountScaleRing, type ScaleRing } from './core/scaleRing';
import { sfx } from './audio/sfx';
import { LEVELS } from './content/levels';
import type { ControlInput, LevelDef, LevelPhase, LessonProgress, Readout, ReadoutStatus } from './types';
import { HUD, type DragInfo } from './ui/hud';
import { QuizOverlay } from './ui/quiz';
import { ACCENT_HEX, ACCENT_PARTNER, ensureUiStyles } from './ui/uiStyles';
import { applyHudSafeFraming, createControlInput, resetControlInput, type LevelScene } from './levels/base';
import { levelFactories } from './levels/index';

const CHECK_UNLOCK_S = 20;
const clamp = THREE.MathUtils.clamp;
const clamp01 = (v: number): number => clamp(v, 0, 1);

function beatDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return clamp(3.2 + words * 0.09, 3.8, 6);
}

function stageT(i: number): number {
  return LEVELS.length > 1 ? i / (LEVELS.length - 1) : 0;
}

function resolveContainer(): HTMLElement {
  let el = document.getElementById('app');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app';
    document.body.appendChild(el);
  } else {
    el.replaceChildren();
  }
  return el;
}

function detectLowPower(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has('lp')) return q.get('lp') !== '0';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency ?? 8;
  return coarse && cores <= 4;
}

function initialIndex(): number {
  const q = new URLSearchParams(location.search);
  const id = q.get('level');
  if (id) {
    const i = LEVELS.findIndex((l) => l.id === id);
    if (i >= 0) return i;
  }
  const n = Number(q.get('stage'));
  if (Number.isInteger(n) && n >= 1 && n <= LEVELS.length) return n - 1;
  return 0;
}

interface PlaceholderSim {
  value: number;
  progress: number;
  pulse: number;
  spin: number;
  spinVel: number;
  lastTap: number;
  bpm: number;
  loops: number;
}

export class App {
  private readonly container: HTMLElement;
  private readonly stage: StageRenderer;
  private readonly torso: GlassTorso;
  private readonly ring: ScaleRing;
  private readonly hud: HUD;
  private readonly quiz: QuizOverlay;
  private readonly lowPower: boolean;
  private readonly unsubResize: () => void;

  private index = -1;
  private def: LevelDef = LEVELS[0];
  private level: LevelScene | null = null;
  private phase: LevelPhase = 'tour';
  private started = false;
  private finished = false;
  private ready = false;

  private tourBeat = 0;
  private tourTime = 0;
  private tourDur = 4;
  private handsOnTime = 0;
  private goal = false;

  private readonly input: ControlInput = createControlInput();
  private pendingTaps = 0;
  private pendingDX = 0;
  private pendingDY = 0;
  private holdStartedAt = 0;
  private keyHolding = false;
  private stopBreath: (() => void) | null = null;

  private readonly sim: PlaceholderSim = {
    value: 0,
    progress: 0,
    pulse: 0,
    spin: 0,
    spinVel: 0,
    lastTap: 0,
    bpm: 0,
    loops: 0,
  };

  private torsoFade = 1;
  private torsoFadeTarget = 1;
  private fade = 1;
  private raf = 0;

  private readonly progress: LessonProgress = { currentIndex: 0, phase: 'tour', completed: [], results: [] };

  constructor(mount?: HTMLElement) {
    ensureUiStyles();
    this.container = mount ?? resolveContainer();
    this.container.classList.add('oj-root');
    this.container.dataset.accent = 'cyan';
    this.lowPower = detectLowPower();

    this.stage = createRenderer(this.container, {
      accent: ACCENT_HEX.cyan,
      bloomStrength: this.lowPower ? 0.45 : 0.55,
      maxDpr: this.lowPower ? 1.5 : 2,
    });
    this.unsubResize = this.stage.onResized(() => this.syncViewport(true));

    this.torso = createGlassTorso({
      lowPower: this.lowPower,
      accent: ACCENT_HEX.cyan,
      accent2: ACCENT_PARTNER.cyan,
    });
    this.stage.scene.add(this.torso.group);

    const ringHost = document.createElement('div');
    ringHost.className = 'scale-ring-host';
    this.container.appendChild(ringHost);
    this.ring = mountScaleRing(ringHost, {
      stages: LEVELS.length,
      accent: 'cyan',
      initialLabel: LEVELS[0].scaleLabel,
      initialT: 0,
      initialPower: LEVELS[0].scalePower,
    });

    this.hud = new HUD(this.container, this.stage.renderer.domElement, {
      onStart: () => this.begin(),
      onRestart: () => this.restart(),
      onNext: () => this.next(),
      onPrev: () => this.prev(),
      onSkipTour: () => this.enterHandsOn(),
      onTourAdvance: () => this.advanceTour(),
      onSurfaceTap: () => this.surfaceTap(),
      onCheck: () => this.enterCheck(),
      onHoldStart: () => this.holdBegin(false),
      onHoldEnd: () => this.holdEnd(),
      onTap: () => this.tap(false),
      onSlider: (v) => {
        this.input.slider = v;
        this.level?.onSlider(v);
      },
      onExtraSlider: (v) => {
        this.input.extra = v;
        this.level?.onExtraSlider(v);
      },
      onDrag: (d) => this.drag(d),
      onMute: (m) => sfx.setMuted(m),
    });
    this.hud.setMuted(sfx.isMuted());

    this.quiz = new QuizOverlay(this.container);
  }

  /* ======================================================================= */
  /* Lifecycle                                                               */
  /* ======================================================================= */

  start(): void {
    if (this.raf) return;
    this.hud.setLoading(true);
    this.hud.showSplash();
    this.hud.setProgress(-1, this.doneFlags());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.unsubResize();
    this.releaseControls();
    this.teardownLevel();
    this.quiz.dispose();
    this.hud.dispose();
    this.ring.dispose();
    this.torso.dispose();
    this.stage.dispose();
  }

  private begin(): void {
    if (this.started || !this.ready) return;
    this.started = true;
    void sfx.resume();
    this.hud.hideSplash();
    this.goToLevel(initialIndex(), 1);
  }

  private restart(): void {
    this.progress.completed = [];
    this.progress.results = [];
    this.started = true;
    this.finished = false;
    void sfx.resume();
    this.hud.hideSplash();
    this.goToLevel(0, 1);
  }

  private next(): void {
    if (!this.started || this.finished) return;
    if (this.index < LEVELS.length - 1) this.goToLevel(this.index + 1, 1);
    else this.showFinish();
  }

  private prev(): void {
    if (!this.started) return;
    if (this.finished) {
      this.hud.hideSplash();
      this.goToLevel(LEVELS.length - 1, -1);
      return;
    }
    if (this.index > 0) this.goToLevel(this.index - 1, -1);
  }

  /* ======================================================================= */
  /* Levels                                                                  */
  /* ======================================================================= */

  private applyAccent(def: LevelDef): void {
    const hex = ACCENT_HEX[def.accent];
    this.container.dataset.accent = def.accent;
    this.stage.studio.setAccent(hex);
    this.torso.setAccent(hex, ACCENT_PARTNER[def.accent]);
    this.ring.setAccent(def.accent);
  }

  private goToLevel(i: number, dir: 1 | -1): void {
    if (i < 0 || i >= LEVELS.length) return;
    this.quiz.close();
    this.releaseControls();
    this.teardownLevel();
    this.stage.resetAtmosphere();

    this.finished = false;
    this.index = i;
    this.def = LEVELS[i];
    this.progress.currentIndex = i;
    const def = this.def;

    this.applyAccent(def);
    this.ring.setScale(def.scaleLabel, stageT(i));
    this.ring.setPower(def.scalePower);

    const extra = def.extraSlider?.initial ?? 0.5;
    resetControlInput(this.input, extra);
    this.pendingTaps = this.pendingDX = this.pendingDY = 0;
    Object.assign(this.sim, { value: def.readout.min, progress: 0, pulse: 0.6, lastTap: 0, bpm: 0, loops: 0 });

    this.hud.setLevel(def, i, LEVELS.length);
    this.hud.setProgress(i, this.doneFlags());

    const factory = levelFactories[def.id];
    if (factory) {
      try {
        const lvl = factory();
        lvl.enter({
          def,
          scene: this.stage.scene,
          renderer: this.stage.renderer,
          studio: this.stage.studio,
          torso: this.torso,
          accent: new THREE.Color(ACCENT_HEX[def.accent]),
          lowPower: this.lowPower,
        });
        lvl.onSlider(this.input.slider);
        lvl.onExtraSlider(extra);
        this.level = lvl;
      } catch (err) {
        console.error(`[app] level "${def.id}" failed to build — using placeholder.`, err);
        this.level = null;
      }
    }
    this.syncViewport(true);

    this.torsoFadeTarget = this.level ? (this.level.showsBody ? 1 : 0) : 1;
    this.fade = 0.15;
    this.stage.setFade(this.fade);
    sfx.whoosh(dir);
    this.enterTour();
  }

  private teardownLevel(): void {
    if (!this.level) return;
    const lvl = this.level;
    this.level = null;
    try {
      lvl.exit();
      lvl.dispose();
    } catch (err) {
      console.error('[app] level teardown failed', err);
    }
  }

  private doneFlags(): boolean[] {
    return LEVELS.map((l) => this.progress.completed.includes(l.id));
  }

  /** Keep the active level camera's aspect + HUD-safe offset in sync with the canvas. */
  private syncViewport(force: boolean): void {
    const lvl = this.level;
    if (!lvl) return;
    const { width, height } = this.stage.size;
    lvl.setViewport(width, height, force);
    // Covers levels that hand back a camera other than their base one.
    const cam = lvl.getCamera();
    if (cam && Math.abs(cam.aspect - width / Math.max(1, height)) > 1e-4) {
      applyHudSafeFraming(cam, width, height);
    }
  }

  /* ======================================================================= */
  /* Phases                                                                  */
  /* ======================================================================= */

  private setPhase(phase: LevelPhase): void {
    this.phase = phase;
    this.progress.phase = phase;
    this.hud.setPhase(phase);
    this.level?.setPhase(phase);
  }

  private enterTour(): void {
    this.setPhase('tour');
    this.tourBeat = 0;
    this.showBeat();
  }

  private showBeat(): void {
    const beats = this.def.tourText;
    const text = beats[this.tourBeat] ?? '';
    this.tourTime = 0;
    this.tourDur = beatDuration(text);
    this.hud.setTour(text, this.tourBeat, beats.length);
    this.level?.setTourBeat(this.tourBeat);
  }

  private advanceTour(): void {
    if (this.phase !== 'tour' || !this.started || this.finished) return;
    this.tourBeat++;
    if (this.tourBeat >= this.def.tourText.length) {
      this.enterHandsOn();
      return;
    }
    sfx.tap(0.7);
    this.showBeat();
  }

  private enterHandsOn(): void {
    if (this.phase !== 'tour' || !this.started || this.finished) return;
    this.goal = false;
    this.handsOnTime = 0;
    this.setPhase('handsOn');
    this.hud.setYourTurn(this.def.yourTurn, false);
    this.hud.setCheckReady(false);
    sfx.tap(1.3);
  }

  private reachGoal(): void {
    if (this.goal) return;
    this.goal = true;
    this.sim.pulse = 1;
    this.hud.setYourTurn(this.def.successText, true);
    this.hud.setCheckReady(true);
    sfx.success();
  }

  private enterCheck(): void {
    if (this.phase !== 'handsOn') return;
    if (!this.goal && this.handsOnTime < CHECK_UNLOCK_S) return;
    this.releaseControls();
    this.setPhase('check');
    sfx.whoosh(1);
    this.quiz.open(this.def.quiz, (correct, total) => this.finishLevel(correct, total));
  }

  private finishLevel(correct: number, total: number): void {
    const id = this.def.id;
    this.progress.results = this.progress.results.filter((r) => r.levelId !== id);
    this.progress.results.push({ levelId: id, correct, total });
    if (!this.progress.completed.includes(id)) this.progress.completed.push(id);
    if (this.index >= LEVELS.length - 1) this.showFinish();
    else this.goToLevel(this.index + 1, 1);
  }

  private showFinish(): void {
    this.quiz.close();
    this.releaseControls();
    this.teardownLevel();
    this.stage.resetAtmosphere();
    this.finished = true;
    this.applyAccent(LEVELS[0]);
    this.torsoFadeTarget = 1;
    this.ring.setScale('COMPLETE', 1);
    this.ring.setPower(0);
    this.hud.setProgress(-1, this.doneFlags());
    const correct = this.progress.results.reduce((a, r) => a + r.correct, 0);
    const total = this.progress.results.reduce((a, r) => a + r.total, 0);
    this.hud.showFinish(correct, total);
    sfx.success();
  }

  /* ======================================================================= */
  /* Controls                                                                */
  /* ======================================================================= */

  private holdBegin(fromKey: boolean): void {
    if (this.phase !== 'handsOn' || this.def.controlKind !== 'hold' || this.input.holding) return;
    this.input.holding = true;
    this.holdStartedAt = performance.now();
    this.keyHolding = fromKey;
    if (fromKey) this.hud.setHoldActive(true);
    this.level?.onHoldStart();
    this.stopBreath?.();
    this.stopBreath = this.def.id === 'out' ? sfx.exhale(5) : sfx.inhale(this.def.id === 'breathe' ? 2.2 : 4);
  }

  private holdEnd(): void {
    if (!this.input.holding) return;
    this.input.holding = false;
    this.keyHolding = false;
    this.hud.setHoldActive(false);
    this.level?.onHoldEnd();
    this.stopBreath?.();
    this.stopBreath = null;
    if (this.def.id === 'breathe') sfx.exhale(1.3);
  }

  private tap(fromKey: boolean): void {
    if (this.phase !== 'handsOn' || this.def.controlKind !== 'tap') return;
    this.pendingTaps++;
    this.input.tapCount++;
    if (fromKey) this.hud.flashTap();
    this.level?.onTap();
    const bpm = this.def.readout.unit === 'bpm';
    sfx.tap(bpm ? 0.45 : 1 + Math.min(this.input.tapCount, 20) * 0.03);
    if (!this.level) this.simTap();
  }

  private surfaceTap(): void {
    if (!this.started || this.finished || this.quiz.isOpen) return;
    if (this.phase === 'tour') this.advanceTour();
    else if (this.phase === 'handsOn' && this.def.controlKind === 'tap') this.tap(true);
  }

  private drag(d: DragInfo): void {
    if (!this.started || this.finished || this.phase === 'check') return;
    if (d.phase === 'start') this.input.dragging = true;
    else if (d.phase === 'end') this.input.dragging = false;
    this.pendingDX += d.dx;
    this.pendingDY += d.dy;
    if (!this.level) this.sim.spinVel += d.dx * 0.012;
    this.level?.onDrag(d);
  }

  private releaseControls(): void {
    this.holdEnd();
    this.input.dragging = false;
    this.pendingTaps = this.pendingDX = this.pendingDY = 0;
  }

  /* ======================================================================= */
  /* Keyboard                                                                */
  /* ======================================================================= */

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tgt = e.target as HTMLElement | null;
    const tag = tgt?.tagName ?? '';
    const isRange = tag === 'INPUT' && (tgt as HTMLInputElement).type === 'range';
    const inField = tag === 'TEXTAREA' || (tag === 'INPUT' && !isRange) || !!tgt?.isContentEditable;
    if (inField) return;
    const isSpace = e.code === 'Space' || e.key === ' ';

    if (e.key === 'm' || e.key === 'M') {
      const m = !sfx.isMuted();
      sfx.setMuted(m);
      this.hud.setMuted(m);
      return;
    }

    if (!this.started || this.finished) {
      if ((isSpace || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        if (this.finished) this.restart();
        else this.begin();
      }
      return;
    }
    if (this.quiz.isOpen) return;

    if (isSpace) {
      e.preventDefault();
      if (e.repeat) return;
      if (this.phase === 'tour') this.advanceTour();
      else if (this.phase === 'handsOn') {
        if (this.def.controlKind === 'hold') this.holdBegin(true);
        else if (this.def.controlKind === 'tap') this.tap(true);
      }
      return;
    }

    if (e.key === 'Enter' && tag !== 'BUTTON' && !e.repeat) {
      e.preventDefault();
      if (this.phase === 'tour') this.enterHandsOn();
      else if (this.phase === 'handsOn') this.enterCheck();
      return;
    }

    if (isRange) return; // range sliders own the arrow keys
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.prev();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.key === ' ') {
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag !== 'TEXTAREA') e.preventDefault();
      if (this.keyHolding) this.holdEnd();
    }
  };

  private readonly onBlur = (): void => this.releaseControls();

  private readonly onVisibility = (): void => {
    if (document.hidden) this.releaseControls();
  };

  /* ======================================================================= */
  /* Placeholder simulation (stages without a factory)                       */
  /* ======================================================================= */

  private simTap(): void {
    const s = this.sim;
    const spec = this.def.readout;
    const now = performance.now();
    if (spec.unit === 'bpm') {
      const iv = (now - s.lastTap) / 1000;
      if (s.lastTap > 0 && iv > 0.25 && iv < 2.5) {
        const inst = 60 / iv;
        s.bpm = s.bpm <= 1 ? inst : s.bpm * 0.55 + inst * 0.45;
      }
    } else {
      s.value = Math.min(spec.max, s.value + Math.max(1, Math.ceil((spec.target - spec.min) / 8)));
    }
    s.lastTap = now;
    s.pulse = 1;
  }

  private simulate(dt: number): Readout {
    const def = this.def;
    const spec = def.readout;
    const s = this.sim;
    const inp = this.input;
    const span = Math.max(1e-6, spec.max - spec.min);
    let active = false;
    let warn = false;
    let note: string | undefined;
    let progress: number | null = null;

    switch (def.controlKind) {
      case 'hold': {
        const e = inp.extra;
        let ceiling = 1;
        if (def.extraSlider) ceiling = def.id === 'swap' ? clamp01(1.08 - 0.9 * e) : clamp01(0.3 + 0.85 * e);
        if (inp.holding) {
          active = true;
          const k = def.id === 'out' ? 0.55 : 1.15;
          const goal = spec.min + span * ceiling;
          s.value += (goal - s.value) * (1 - Math.exp(-dt * k));
        } else if (def.id !== 'out') {
          s.value += (spec.min - s.value) * (1 - Math.exp(-dt * 1.3));
        }
        break;
      }
      case 'tap': {
        if (spec.unit === 'bpm') {
          const since = (performance.now() - s.lastTap) / 1000;
          if (since > 2) s.bpm *= Math.exp(-dt * 0.9);
          s.value = s.bpm;
          active = since < 1.5;
        } else {
          active = inp.tapsThisFrame > 0;
        }
        break;
      }
      case 'slider': {
        if (def.id === 'loops') {
          s.loops = Math.min(spec.max, s.loops + inp.slider * dt * 0.4);
          s.value = Math.floor(s.loops + 1e-6);
          progress = (s.loops - spec.min) / span;
          active = inp.slider > 0.02;
        } else {
          const tgt = spec.min + inp.slider * span;
          s.value += (tgt - s.value) * (1 - Math.exp(-dt * 5));
          active = inp.slider > 0.02;
          if (def.id === 'run' && inp.slider > 0.72) {
            warn = true;
            note = 'ANAEROBIC';
          }
        }
        break;
      }
      case 'drag': {
        const d = Math.hypot(inp.dragDX, inp.dragDY);
        s.value = Math.min(spec.max, s.value + d * span * 0.0011);
        active = inp.dragging;
        break;
      }
    }

    s.value = clamp(s.value, spec.min, spec.max);
    s.progress = clamp01(progress ?? (s.value - spec.min) / span);
    const reached = Number(s.value.toFixed(spec.decimals)) >= spec.target;
    const status: ReadoutStatus = reached ? 'done' : warn ? 'warn' : active ? 'active' : 'idle';
    return { label: spec.label, value: s.value, unit: spec.unit, progress: s.progress, status, note };
  }

  /** Drive the glass torso from the live controls (placeholder + splash/finish). */
  private driveTorso(dt: number, t: number): void {
    const s = this.sim;
    const handsOn = this.started && !this.finished && this.phase === 'handsOn';
    const prog = handsOn ? s.progress : 0;

    s.pulse = Math.max(0, s.pulse - dt * 2.2);
    s.spinVel *= Math.exp(-dt * 2.4);
    s.spin += s.spinVel * dt;
    if (!this.input.dragging) s.spin *= Math.exp(-dt * 0.35);
    this.torso.group.rotation.y = s.spin + Math.sin(t * 0.25) * 0.14;

    const idle = 0.18 + 0.18 * Math.sin(t * 1.25);
    const breath = handsOn && this.def.controlKind === 'hold' ? prog : idle + prog * 0.4;
    this.torso.setBreath(breath);
    this.torso.setRim(1.3 + prog * 0.9 + s.pulse * 1.1);
    this.torso.setSpineGlow(0.8 + prog * 0.8 + s.pulse * 1.4);
    const touring = !this.started || this.finished || this.phase === 'tour';
    this.torso.setScan(touring ? 0.55 : 0.1 + prog * 0.5);
  }

  /* ======================================================================= */
  /* Frame loop                                                              */
  /* ======================================================================= */

  private readonly loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.stage.clock.getDelta());
    const t = this.stage.clock.elapsedTime;
    this.step(dt, t);
    this.render(t);
    if (!this.ready) {
      this.ready = true;
      this.hud.setLoading(false);
    }
  };

  private step(dt: number, t: number): void {
    const inp = this.input;
    inp.tapsThisFrame = this.pendingTaps;
    inp.dragDX = this.pendingDX;
    inp.dragDY = this.pendingDY;
    this.pendingTaps = this.pendingDX = this.pendingDY = 0;
    inp.holdTime = inp.holding ? (performance.now() - this.holdStartedAt) / 1000 : 0;

    const live = this.started && !this.finished;

    // Tour auto-advance.
    if (live && this.phase === 'tour') {
      this.tourTime += dt;
      this.hud.setTourProgress(this.tourTime / this.tourDur);
      if (this.tourTime >= this.tourDur) this.advanceTour();
    }

    // Scene + readout.
    let readout: Readout | null = null;
    if (this.level) {
      try {
        this.level.update(dt, t, inp);
        if (live && this.phase === 'handsOn') readout = this.level.getReadout();
      } catch (err) {
        console.error(`[app] level "${this.def.id}" crashed — switching to placeholder.`, err);
        this.teardownLevel();
        this.torsoFadeTarget = 1;
      }
    } else if (live && this.phase === 'handsOn') {
      readout = this.simulate(dt);
    }

    if (readout && this.phase === 'handsOn') {
      this.handsOnTime += dt;
      this.hud.setReadout(readout);
      if (!this.goal && readout.status === 'done') this.reachGoal();
      this.hud.setCheckReady(this.goal || this.handsOnTime >= CHECK_UNLOCK_S);
    }

    // Torso.
    if (!this.level) this.driveTorso(dt, t);
    const prevFade = this.torsoFade;
    this.torsoFade += (this.torsoFadeTarget - this.torsoFade) * (1 - Math.exp(-dt * 4));
    if (Math.abs(this.torsoFade - this.torsoFadeTarget) < 0.002) this.torsoFade = this.torsoFadeTarget;
    if (this.torsoFade !== prevFade) this.torso.setOpacity(this.torsoFade);
    this.torso.group.visible = this.torsoFade > 0.002;
    if (this.torso.group.visible) this.torso.update(t, dt);

    // Exposure fade-in on stage change.
    if (this.fade < 1) {
      this.fade += (1 - this.fade) * (1 - Math.exp(-dt * 2.8));
      if (1 - this.fade < 0.003) this.fade = 1;
      this.stage.setFade(this.fade);
    }
  }

  private updateStageCamera(t: number): void {
    const cam = this.stage.camera;
    const { width, height, portrait } = this.stage.size;
    const d = portrait ? 4.2 : 3.5;
    const yaw = Math.sin(t * 0.11) * 0.12;
    cam.position.set(Math.sin(yaw) * d, 0.16 + Math.sin(t * 0.17) * 0.02, Math.cos(yaw) * d);
    cam.lookAt(0, 0.05, 0);
    applyHudSafeFraming(cam, width, height);
  }

  private render(t: number): void {
    const cam = this.level?.getCamera() ?? null;
    if (this.level && cam) {
      this.syncViewport(false);
      this.stage.render(this.stage.scene, cam);
    } else {
      this.updateStageCamera(t);
      this.stage.render();
    }
  }
}