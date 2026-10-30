/**
 * Oxygen Journey — level scene registry.
 */
import type { LevelId } from '../types';
import type { LevelScene } from './base';
import { Level01Breathe } from './level01_breathe';
import { Level02Tree } from './level02_tree';
import { Level03Unfold } from './level03_unfold';
import { Level04Swap } from './level04_swap';
import { Level05Ride } from './level05_ride';
import { Level06Pump } from './level06_pump';
import { Level07Loops } from './level07_loops';
import { Level08Burn } from './level08_burn';
import { Level09Run } from './level09_run';
import { Level10Out } from './level10_out';

export type LevelFactory = () => LevelScene;

export const LEVEL_FACTORIES: Partial<Record<LevelId, LevelFactory>> = {
  breathe: () => new Level01Breathe(),
  tree: () => new Level02Tree(),
  unfold: () => new Level03Unfold(),
  swap: () => new Level04Swap(),
  ride: () => new Level05Ride(),
  pump: () => new Level06Pump(),
  loops: () => new Level07Loops(),
  burn: () => new Level08Burn(),
  run: () => new Level09Run(),
  out: () => new Level10Out(),
};

export function hasLevelScene(id: LevelId): boolean {
  return LEVEL_FACTORIES[id] !== undefined;
}

export function createLevelScene(id: LevelId): LevelScene | null {
  const factory = LEVEL_FACTORIES[id];
  return factory ? factory() : null;
}

export function getLevelFactory(id: LevelId): LevelFactory | undefined {
  return LEVEL_FACTORIES[id];
}

export const levelFactories = LEVEL_FACTORIES;
export const createLevel = createLevelScene;
