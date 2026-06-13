// Client-side simulation. A direct port of the former server engine
// (src/simulation/SimulationEngine.cs): pure logic with no I/O — the caller
// supplies how much time has passed and the current content catalog. The same
// Tick handles a one-frame delta and a multi-hour offline catch-up, because the
// inner loop completes as many production cycles as the delta allows.

import { deriveSeed, drawCycleTime, drawFailureInterval, drawRepairTime } from './rng';
import { stationDynamics, type StationDynamics } from './tuning';
import type { BuildingDefinition, GameContent, GameState } from './types';

const STARTING_CASH = 2000;
const FINISHED_TIER = 2; // ResourceTier.Finished

export interface EngineBuilding {
  definitionId: string;
  /** Seconds elapsed in the current production cycle. */
  progressSeconds: number;
  /** True once inputs for the current cycle have been consumed. */
  cycleActive: boolean;
  /** Duration drawn for the current cycle (varies per cycle). 0 until a cycle starts. */
  cycleTargetSeconds: number;
  /** Operating seconds left before the next breakdown; counts down only while running. */
  timeToFailure: number;
  /** Repair seconds remaining; > 0 means the machine is down. */
  downRemaining: number;
  /** This building's private PRNG stream state (see rng.ts). */
  rngState: number;
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
  /** Master seed; only used to spawn each new building's private RNG stream. */
  rngSeed: number;
}

/** Build a fresh building instance, seeding its RNG stream from the factory's master seed. */
function makeBuilding(state: EngineState, definitionId: string): EngineBuilding {
  const rngState = deriveSeed(state.rngSeed, state.buildings.length);
  return {
    definitionId,
    progressSeconds: 0,
    cycleActive: false,
    cycleTargetSeconds: 0,
    timeToFailure: 0,
    downRemaining: 0,
    rngState,
  };
}

/** A fresh factory: enough cash for an opening chain and one cheap extractor. */
export function newFactory(content: GameContent): EngineState {
  const state: EngineState = {
    cash: STARTING_CASH,
    lifetimeRevenue: 0,
    inventory: {},
    buildings: [],
    elapsedSeconds: 0,
    rngSeed: (Math.random() * 0x100000000) >>> 0,
  };

  const extractor = content.buildings
    .filter((b) => b.inputResourceId === null)
    .sort((a, b) => a.cost - b.cost)[0];
  if (extractor) {
    state.buildings.push(makeBuilding(state, extractor.id));
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

  if (state.rngSeed === undefined) state.rngSeed = 0; // backfill pre-M2 saves

  const buildingById = new Map(content.buildings.map((b) => [b.id, b]));
  const resourceById = new Map(content.resources.map((r) => [r.id, r]));

  state.elapsedSeconds += deltaSeconds;

  state.buildings.forEach((building, index) => {
    const def = buildingById.get(building.definitionId);
    if (!def) return; // definition deleted/renamed by an admin; idle rather than crash
    hydrate(state, building, index);
    advanceBuilding(state, building, def, stationDynamics(def), deltaSeconds, resourceById);
  });
}

/** Backfill fields absent from pre-Milestone-2 saves so arithmetic never sees undefined. */
function hydrate(state: EngineState, building: EngineBuilding, index: number): void {
  if (building.cycleTargetSeconds === undefined) building.cycleTargetSeconds = 0;
  if (building.timeToFailure === undefined) building.timeToFailure = 0;
  if (building.downRemaining === undefined) building.downRemaining = 0;
  if (building.rngState === undefined) building.rngState = deriveSeed(state.rngSeed, index);
}

/**
 * Advance one building by up to `deltaSeconds`, looping so a large delta
 * (offline catch-up) completes many cycles. Three phases interleave: burning
 * down a repair, starting a fresh cycle (consume inputs, draw a variable cycle
 * time), and running — which can either trip a breakdown (work pauses, partial
 * progress is kept) or complete the cycle and emit output. All randomness flows
 * from the building's own RNG stream, so the draw sequence — and therefore the
 * outcome — is identical no matter how the delta is chunked.
 */
function advanceBuilding(
  state: EngineState,
  building: EngineBuilding,
  def: BuildingDefinition,
  dyn: StationDynamics,
  deltaSeconds: number,
  resourceById: Map<string, { tier: number; baseValue: number }>,
): void {
  let remaining = deltaSeconds;

  while (remaining > 0) {
    // Phase 1: down for repair.
    if (building.downRemaining > 0) {
      const step = Math.min(remaining, building.downRemaining);
      building.downRemaining -= step;
      remaining -= step;
      if (building.downRemaining <= 0) {
        const next = drawFailureInterval(dyn.mtbfSeconds, building.rngState);
        building.timeToFailure = next.value;
        building.rngState = next.state;
      }
      continue;
    }

    // Phase 2: start a cycle if idle.
    if (!building.cycleActive) {
      if (!tryConsumeInputs(state, def)) break; // starved — wait for upstream
      building.cycleActive = true;
      building.progressSeconds = 0;
      const drawn = drawCycleTime(def.productionTimeSeconds, dyn.cv, building.rngState);
      building.cycleTargetSeconds = drawn.value;
      building.rngState = drawn.state;
      if (building.timeToFailure <= 0) {
        const next = drawFailureInterval(dyn.mtbfSeconds, building.rngState);
        building.timeToFailure = next.value;
        building.rngState = next.state;
      }
    }

    // Phase 3: run, limited by the delta, cycle completion, or the next failure.
    const toFinish = building.cycleTargetSeconds - building.progressSeconds;
    const step = Math.min(remaining, toFinish, building.timeToFailure);
    building.progressSeconds += step;
    building.timeToFailure -= step;
    remaining -= step;

    if (building.timeToFailure <= 1e-9) {
      // Breakdown mid-cycle: keep partial progress and the active cycle so
      // inputs aren't re-consumed; just wait out the repair.
      const repair = drawRepairTime(dyn.mttrSeconds, building.rngState);
      building.downRemaining = repair.value;
      building.rngState = repair.state;
    } else if (building.progressSeconds + 1e-9 >= building.cycleTargetSeconds) {
      building.cycleActive = false;
      building.progressSeconds = 0;
      produce(state, def, resourceById);
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

  if (state.rngSeed === undefined) state.rngSeed = 0; // backfill pre-M2 saves
  state.cash -= def.cost;
  state.buildings.push(makeBuilding(state, definitionId));
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
      // Progress is measured against this cycle's drawn target; fall back to the
      // nominal time for pre-M2 saves where no cycle has started yet.
      const def = buildingById.get(b.definitionId);
      const target = b.cycleTargetSeconds || def?.productionTimeSeconds || 0;
      return {
        definitionId: b.definitionId,
        cycleActive: b.cycleActive,
        progress: target > 0 ? Math.min(Math.max(b.progressSeconds / target, 0), 1) : 0,
        down: (b.downRemaining ?? 0) > 0,
      };
    }),
  };
}
