// Client-side simulation. A direct port of the former server engine
// (src/simulation/SimulationEngine.cs): pure logic with no I/O — the caller
// supplies how much time has passed and the current content catalog. The same
// Tick handles a one-frame delta and a multi-hour offline catch-up, because the
// inner loop completes as many production cycles as the delta allows.

import type { BuildingDefinition, GameContent, GameState } from './types';

const STARTING_CASH = 2000;
const FINISHED_TIER = 2; // ResourceTier.Finished

export interface EngineBuilding {
  definitionId: string;
  /** Seconds elapsed in the current production cycle. */
  progressSeconds: number;
  /** True once inputs for the current cycle have been consumed. */
  cycleActive: boolean;
}

/** The complete mutable state of the player's factory. Serialized into saves. */
export interface EngineState {
  cash: number;
  lifetimeRevenue: number;
  /** Resource id → units on hand. */
  inventory: Record<string, number>;
  buildings: EngineBuilding[];
  /** Total simulated seconds since the factory was founded. */
  elapsedSeconds: number;
}

/** A fresh factory: enough cash for an opening chain and one cheap extractor. */
export function newFactory(content: GameContent): EngineState {
  const state: EngineState = {
    cash: STARTING_CASH,
    lifetimeRevenue: 0,
    inventory: {},
    buildings: [],
    elapsedSeconds: 0,
  };

  const extractor = content.buildings
    .filter((b) => b.inputResourceId === null)
    .sort((a, b) => a.cost - b.cost)[0];
  if (extractor) {
    state.buildings.push({ definitionId: extractor.id, progressSeconds: 0, cycleActive: false });
  }

  return state;
}

/**
 * Advance the factory by `deltaSeconds`. Each building consumes its inputs to
 * start a cycle, accumulates progress, and on completion emits output;
 * finished-tier goods auto-sell at base value. Buildings are processed in
 * content order so goods flow through multiple steps across one tick and
 * bottlenecks back up naturally.
 */
export function tick(state: EngineState, deltaSeconds: number, content: GameContent): void {
  if (deltaSeconds <= 0) return;

  const buildingById = new Map(content.buildings.map((b) => [b.id, b]));
  const resourceById = new Map(content.resources.map((r) => [r.id, r]));

  state.elapsedSeconds += deltaSeconds;

  for (const building of state.buildings) {
    const def = buildingById.get(building.definitionId);
    if (!def) continue; // definition deleted/renamed by an admin; idle rather than crash

    let remaining = deltaSeconds;

    // A single large delta (offline catch-up) may complete many cycles.
    while (remaining > 0) {
      if (!building.cycleActive) {
        if (!tryConsumeInputs(state, def)) break; // starved — wait for upstream
        building.cycleActive = true;
        building.progressSeconds = 0;
      }

      const needed = def.productionTimeSeconds - building.progressSeconds;
      if (remaining < needed) {
        building.progressSeconds += remaining;
        remaining = 0;
      } else {
        remaining -= needed;
        building.cycleActive = false;
        building.progressSeconds = 0;
        produce(state, def, resourceById);
      }
    }
  }
}

/** Buy a building if the player can afford it. Returns false otherwise. */
export function tryPurchaseBuilding(
  state: EngineState,
  definitionId: string,
  content: GameContent,
): boolean {
  const def = content.buildings.find((b) => b.id === definitionId);
  if (!def || state.cash < def.cost) return false;

  state.cash -= def.cost;
  state.buildings.push({ definitionId, progressSeconds: 0, cycleActive: false });
  return true;
}

function tryConsumeInputs(state: EngineState, def: BuildingDefinition): boolean {
  if (def.inputResourceId === null) return true; // raw extractor

  if ((state.inventory[def.inputResourceId] ?? 0) < def.inputAmount) return false;

  state.inventory[def.inputResourceId] -= def.inputAmount;
  return true;
}

function produce(
  state: EngineState,
  def: BuildingDefinition,
  resourceById: Map<string, { tier: number; baseValue: number }>,
): void {
  const resource = resourceById.get(def.outputResourceId);
  if (!resource) return; // output resource deleted by an admin; drop the goods

  if (resource.tier === FINISHED_TIER) {
    // v1: fixed market pricing, instant auto-sell.
    const revenue = resource.baseValue * def.outputAmount;
    state.cash += revenue;
    state.lifetimeRevenue += revenue;
  } else {
    state.inventory[def.outputResourceId] =
      (state.inventory[def.outputResourceId] ?? 0) + def.outputAmount;
  }
}

/** Project engine state into the canvas-facing snapshot (progress as 0..1). */
export function toGameState(state: EngineState, content: GameContent): GameState {
  const buildingById = new Map(content.buildings.map((b) => [b.id, b]));
  return {
    contentVersion: content.version,
    cash: state.cash,
    lifetimeRevenue: state.lifetimeRevenue,
    elapsedSeconds: state.elapsedSeconds,
    inventory: { ...state.inventory },
    buildings: state.buildings.map((b) => {
      const def = buildingById.get(b.definitionId);
      const time = def?.productionTimeSeconds ?? 0;
      return {
        definitionId: b.definitionId,
        cycleActive: b.cycleActive,
        progress: time > 0 ? Math.min(Math.max(b.progressSeconds / time, 0), 1) : 0,
      };
    }),
  };
}
