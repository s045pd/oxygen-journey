/**
 * Oxygen Journey — procedural WebAudio SFX.
 * No samples: breath noise, UI blips, chimes and whooshes are synthesised.
 *
 * Chain: voices → bus → (dry) master → compressor → out
 *                        ↘ convolver (generated room) → master
 *
 * The AudioContext is created lazily and resumed on the first user gesture.
 */

export interface Sfx {
  /** Create/resume the AudioContext. Call from a user gesture. */
  resume(): Promise<void>;
  /** Rising breath-in. Returns a stop() for hold-to-breathe controls. */
  inhale(duration?: number): () => void;
  /** Falling breath-out. Returns a stop(). */
  exhale(duration?: number): () => void;
  /** Short UI blip. pitch multiplies the base frequency. */
  tap(pitch?: number): void;
  success(): void;
  fail(): void;
  /** Transition sweep. direction 1 = left→right, -1 = right→left. */
  whoosh(direction?: 1 | -1): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** Master volume 0..1. */
  setVolume(v: number): void;
  readonly context: AudioContext | null;
}

type AudioCtor = typeof AudioContext;

const MUTE_KEY = 'oj:muted';
const noop = (): void => {};

function getCtor(): AudioCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(m: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

function makeNoise(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  // Slightly pinked white noise (one-pole lowpass blend) — softer breath texture.
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    lp = lp * 0.86 + w * 0.14;
    d[i] = w * 0.55 + lp * 1.6;
  }
  return buf;
}

function makeImpulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function createSfx(autoGesture = true): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let bus: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = readMuted();
  let volume = 0.8;
  let resumeAt = -1e9;
  let lastTap = 0;
  let wasRunning = false;

  function ensure(): AudioContext | null {
    if (ctx) return ctx;
    const Ctor = getCtor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    const c = ctx;

    master = c.createGain();
    master.gain.value = muted ? 0 : volume;

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master.connect(comp);
    comp.connect(c.destination);

    bus = c.createGain();
    bus.gain.value = 1;
    bus.connect(master);

    const verb = c.createConvolver();
    verb.buffer = makeImpulse(c, 1.7, 3.2);
    const verbGain = c.createGain();
    verbGain.gain.value = 0.2;
    bus.connect(verb);
    verb.connect(verbGain);
    verbGain.connect(master);

    noise = makeNoise(c, 2.5);
    return c;
  }

  /** Context ready for scheduling, or null (muted / unavailable / not yet unlocked). */
  function live(): AudioContext | null {
    if (muted) return null;
    const c = ensure();
    if (!c || !bus) return null;
    if (c.state === 'running') return c;
    // A resume() from a gesture is in flight — schedule anyway, it plays on unlock.
    if (performance.now() - resumeAt < 400) return c;
    return null;
  }

  function out(): GainNode {
    return bus as GainNode;
  }

  function noiseSrc(c: AudioContext): AudioBufferSourceNode {
    const s = c.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    return s;
  }

  function panner(c: AudioContext, pan: number): AudioNode | null {
    if (typeof c.createStereoPanner !== 'function') return null;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    return p;
  }

  function cleanup(nodes: AudioNode[]): void {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }

  function chain(nodes: AudioNode[]): void {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  }

  function makeStop(c: AudioContext, g: GainNode, src: AudioScheduledSourceNode): () => void {
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const now = c.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      try {
        src.stop(now + 0.2);
      } catch {
        /* already stopped */
      }
    };
  }

  /* ---- Voices ---- */

  function inhale(duration = 1.4): () => void {
    const c = live();
    if (!c) return noop;
    const t = c.currentTime + 0.005;
    const d = Math.max(0.3, duration);

    const src = noiseSrc(c);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 280;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(650, t);
    bp.frequency.exponentialRampToValueAtTime(2300, t + d);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.28, t + d * 0.4);
    g.gain.linearRampToValueAtTime(0.34, t + d * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
    const pan = panner(c, -0.08);

    const nodes: AudioNode[] = pan ? [src, hp, bp, g, pan, out()] : [src, hp, bp, g, out()];
    chain(nodes);
    src.start(t, Math.random() * 1.5);
    src.stop(t + d + 0.3);
    src.onended = () => cleanup(nodes.slice(0, -1));
    return makeStop(c, g, src);
  }

  function exhale(duration = 1.6): () => void {
    const c = live();
    if (!c) return noop;
    const t = c.currentTime + 0.005;
    const d = Math.max(0.3, duration);

    const src = noiseSrc(c);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1900, t);
    lp.frequency.exponentialRampToValueAtTime(420, t + d);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.6;
    bp.frequency.setValueAtTime(950, t);
    bp.frequency.exponentialRampToValueAtTime(380, t + d);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.38, t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.12, t + d * 0.65);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.15);
    const pan = panner(c, 0.08);

    const nodes: AudioNode[] = pan ? [src, lp, bp, g, pan, out()] : [src, lp, bp, g, out()];
    chain(nodes);
    src.start(t, Math.random() * 1.5);
    src.stop(t + d + 0.25);
    src.onended = () => cleanup(nodes.slice(0, -1));
    return makeStop(c, g, src);
  }

  function tap(pitch = 1): void {
    const c = live();
    if (!c) return;
    const nowMs = performance.now();
    if (nowMs - lastTap < 28) return;
    lastTap = nowMs;
    const t = c.currentTime + 0.002;
    const p = Math.max(0.25, Math.min(4, pitch));

    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(880 * p, t);
    o.frequency.exponentialRampToValueAtTime(440 * p, t + 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    chain([o, g, out()]);
    o.start(t);
    o.stop(t + 0.15);
    o.onended = () => cleanup([o, g]);

    // Tiny click transient.
    const n = noiseSrc(c);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.07, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
    chain([n, hp, ng, out()]);
    n.start(t, Math.random());
    n.stop(t + 0.03);
    n.onended = () => cleanup([n, hp, ng]);
  }

  function note(c: AudioContext, freq: number, t: number, dur: number, peak: number, type: OscillatorType): void {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(freq * 2, t);
    o2.detune.setValueAtTime(6, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(out());
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
    o.onended = () => cleanup([o, o2, g, g2]);
  }

  function success(): void {
    const c = live();
    if (!c) return;
    const t = c.currentTime + 0.01;
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((f, i) => note(c, f, t + i * 0.075, i === freqs.length - 1 ? 0.9 : 0.5, 0.15, 'triangle'));
    note(c, 2093, t + 0.32, 0.35, 0.04, 'sine');
  }

  function fail(): void {
    const c = live();
    if (!c) return;
    const t = c.currentTime + 0.01;
    const steps: [number, number][] = [
      [311.13, 0],
      [233.08, 0.16],
    ];
    for (const [f, off] of steps) {
      const st = t + off;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      lp.Q.value = 2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.11, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.22);
      const a = c.createOscillator();
      a.type = 'sawtooth';
      a.frequency.setValueAtTime(f, st);
      const b = c.createOscillator();
      b.type = 'square';
      b.frequency.setValueAtTime(f, st);
      b.detune.setValueAtTime(-14, st);
      const bg = c.createGain();
      bg.gain.value = 0.4;
      a.connect(lp);
      b.connect(bg);
      bg.connect(lp);
      lp.connect(g);
      g.connect(out());
      a.start(st);
      b.start(st);
      a.stop(st + 0.26);
      b.stop(st + 0.26);
      a.onended = () => cleanup([a, b, bg, lp, g]);
    }
  }

  function whoosh(direction: 1 | -1 = 1): void {
    const c = live();
    if (!c) return;
    const t = c.currentTime + 0.005;
    const d = 0.75;

    const src = noiseSrc(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + d * 0.45);
    bp.frequency.exponentialRampToValueAtTime(520, t + d);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + d * 0.42);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const pan = panner(c, -0.8 * direction);
    if (pan && 'pan' in pan) {
      const sp = pan as StereoPannerNode;
      sp.pan.setValueAtTime(-0.8 * direction, t);
      sp.pan.linearRampToValueAtTime(0.8 * direction, t + d);
    }
    const nodes: AudioNode[] = pan ? [src, bp, g, pan, out()] : [src, bp, g, out()];
    chain(nodes);
    src.start(t, Math.random() * 1.5);
    src.stop(t + d + 0.05);
    src.onended = () => cleanup(nodes.slice(0, -1));

    // Sub sweep for cinematic weight.
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(92, t);
    o.frequency.exponentialRampToValueAtTime(44, t + d);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.09, t + d * 0.35);
    og.gain.exponentialRampToValueAtTime(0.0001, t + d);
    chain([o, og, out()]);
    o.start(t);
    o.stop(t + d + 0.05);
    o.onended = () => cleanup([o, og]);
  }

  /* ---- Control ---- */

  async function resume(): Promise<void> {
    resumeAt = performance.now();
    const c = ensure();
    if (!c) return;
    if (c.state !== 'running') {
      try {
        await c.resume();
      } catch {
        /* blocked until a real gesture */
      }
    }
  }

  function setMuted(m: boolean): void {
    muted = m;
    writeMuted(m);
    if (ctx && master) {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(m ? 0 : volume, now, 0.04);
    }
  }

  function setVolume(v: number): void {
    volume = Math.min(1, Math.max(0, v));
    if (ctx && master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.04);
  }

  /* ---- Gesture unlock + tab visibility ---- */
  if (autoGesture && typeof window !== 'undefined') {
    const events = ['pointerdown', 'touchend', 'keydown', 'click'] as const;
    const unbind = (): void => {
      for (const e of events) window.removeEventListener(e, onGesture, true);
    };
    const onGesture = (): void => {
      void resume().then(() => {
        if (ctx?.state === 'running') unbind();
      });
    };
    for (const e of events) window.addEventListener(e, onGesture, { capture: true, passive: true });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) {
        if (ctx.state === 'running') {
          wasRunning = true;
          void ctx.suspend().catch(noop);
        }
      } else if (wasRunning) {
        wasRunning = false;
        void ctx.resume().catch(noop);
      }
    });
  }

  return {
    resume,
    inhale,
    exhale,
    tap,
    success,
    fail,
    whoosh,
    setMuted,
    isMuted: () => muted,
    setVolume,
    get context() {
      return ctx;
    },
  };
}

/** Shared app-wide instance. */
export const sfx: Sfx = createSfx();