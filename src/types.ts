export type LevelId = 
  | 'breathe' 
  | 'tree' 
  | 'unfold' 
  | 'swap' 
  | 'ride' 
  | 'pump' 
  | 'loops' 
  | 'burn' 
  | 'run' 
  | 'out';

export type LevelPhase = 'tour' | 'handsOn' | 'check';

export type ControlKind = 'hold' | 'tap' | 'drag' | 'slider';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface ExtraSlider {
  label: string;
  initial?: number;
}

export interface LevelDef {
  id: LevelId;
  roman: string;
  title: string;
  scaleLabel: string;
  tourText: string;
  yourTurn: string;
  controlKind: ControlKind;
  controlLabel: string;
  extraSlider?: ExtraSlider;
  quiz: [QuizQuestion, QuizQuestion];
}

export interface Readout {
  label: string;
  value: string;
  unit?: string;
}