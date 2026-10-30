/**
 * Oxygen Journey — shared types.
 * Pure type layer plus the canonical level / phase order. No runtime dependencies.
 */

export const LEVEL_IDS = [
  'breathe',
  'tree',
  'unfold',
  'swap',
  'ride',
  'pump',
  'loops',
  'burn',
  'run',
  'out',
] as const;

export type LevelId = (typeof LEVEL_IDS)[number];

/** Tour → Try → Check */
export type LevelPhase = 'tour' | 'handsOn' | 'check';

export const PHASE_ORDER: readonly LevelPhase[] = ['tour', 'handsOn', 'check'];

export type ControlKind = 'hold' | 'tap' | 'drag' | 'slider';

/** Neon accent families, mapped to CSS vars via [data-accent]. */
export type AccentName = 'cyan' | 'magenta' | 'violet' | 'crimson' | 'amber';

export interface QuizQuestion {
  prompt: string;
  options: string[];
  /** Index into options. */
  correctIndex: number;
  /** Short feedback shown after answering (right or wrong). */
  explain: string;
}

/** Optional secondary slider (used alongside a hold control). Values are normalised 0..1. */
export interface ExtraSliderDef {
  label: string;
  /** 0..1, defaults to 0.5 when omitted. */
  initial?: number;
}

/** Static description of a level's live readout. */
export interface ReadoutSpec {
  label: string;
  unit: string;
  min: number;
  max: number;
  decimals: number;
  /** Value at which the hands-on goal counts as reached. */
  target: number;
}

export type ReadoutStatus = 'idle' | 'active' | 'warn' | 'done';

/** Live readout value pushed from a scene to the HUD each frame. */
export interface Readout {
  label: string;
  value: number;
  unit: string;
  /** Normalised 0..1 for the bar fill. */
  progress: number;
  status: ReadoutStatus;
  /** Optional override text, e.g. "ANAEROBIC". */
  note?: string;
}

export interface LevelDef {
  id: LevelId;
  roman: string;
  title: string;
  tagline: string;
  /**
   * Right-edge scale clock label: magnification token + subject,
   * e.g. "×10³ ALVEOLI". The ring splits on the first space.
   */
  scaleLabel: string;
  /** Power of ten for the scale clock's magnification pips (0 = whole body, 6 = cell). */
  scalePower: number;
  accent: AccentName;
  /** Tour beats, shown one at a time. Keep each beat short for phones (≤ ~110 chars). */
  tourText: string[];
  /** Instruction shown under the YOUR TURN kicker. */
  yourTurn: string;
  controlKind: ControlKind;
  controlLabel: string;
  readout: ReadoutSpec;
  extraSlider?: ExtraSliderDef;
  /** Shown when the hands-on goal is reached. */
  successText: string;
  quiz: [QuizQuestion, QuizQuestion];
}

/** Per-frame input snapshot fed from HUD controls into the active scene. */
export interface ControlInput {
  /** Hold control currently pressed. */
  holding: boolean;
  /** Seconds the current hold has lasted (0 when released). */
  holdTime: number;
  /** Taps registered since the previous frame. */
  tapsThisFrame: number;
  /** Total taps this level. */
  tapCount: number;
  dragging: boolean;
  /** Pointer delta since previous frame, in CSS pixels. */
  dragDX: number;
  dragDY: number;
  /** Main slider value, 0..1. */
  slider: number;
  /** Extra slider value, 0..1 (only meaningful when LevelDef.extraSlider exists). */
  extra: number;
}

export interface QuizResult {
  levelId: LevelId;
  correct: number;
  total: number;
}

export interface LessonProgress {
  currentIndex: number;
  phase: LevelPhase;
  completed: LevelId[];
  results: QuizResult[];
}