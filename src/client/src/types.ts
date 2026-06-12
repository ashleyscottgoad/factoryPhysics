// Mirrors the DTOs served by FactoryPhysics.Api (camelCased by System.Text.Json).

export type ResourceTier = 0 | 1 | 2; // Raw | Intermediate | Finished

export interface ResourceDefinition {
  id: string;
  name: string;
  tier: ResourceTier;
  baseValue: number;
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
}

export interface GameContent {
  resources: ResourceDefinition[];
  buildings: BuildingDefinition[];
}

export interface BuildingState {
  definitionId: string;
  cycleActive: boolean;
  progress: number; // 0..1
}

export interface GameState {
  cash: number;
  lifetimeRevenue: number;
  elapsedSeconds: number;
  inventory: Record<string, number>;
  buildings: BuildingState[];
}
