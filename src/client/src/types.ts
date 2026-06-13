// Mirrors the DTOs served by FactoryPhysics.Api (camelCased by System.Text.Json).

export type ResourceTier = 0 | 1 | 2; // Raw | Intermediate | Finished

export const TIER_NAMES: Record<ResourceTier, string> = {
  0: 'Raw',
  1: 'Intermediate',
  2: 'Finished',
};

export type BuildingShape = 'box' | 'rounded' | 'pill';

export interface ResourceDefinition {
  id: string;
  name: string;
  tier: ResourceTier;
  baseValue: number;
  color: string;
  icon: string;
  sortOrder: number;
}

export interface BuildingDefinition {
  id: string;
  name: string;
  inputResourceId: string | null;
  inputAmount: number;
  outputResourceId: string;
  outputAmount: number;
  productionTimeSeconds: number;
  cost: number;
  color: string;
  shape: BuildingShape;
  icon: string;
  sortOrder: number;
}

export interface GameContent {
  version: number;
  resources: ResourceDefinition[];
  buildings: BuildingDefinition[];
}

export interface BuildingState {
  definitionId: string;
  cycleActive: boolean;
  progress: number; // 0..1
  /** True while the machine is broken down and awaiting repair. */
  down: boolean;
}

export interface GameState {
  contentVersion: number;
  cash: number;
  lifetimeRevenue: number;
  elapsedSeconds: number;
  inventory: Record<string, number>;
  buildings: BuildingState[];
}
