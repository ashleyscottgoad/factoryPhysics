import { beforeEach, describe, expect, it, vi } from 'vitest';

// Control the per-station dynamics so each test can isolate one behavior. The
// real tuning constants live in tuning.ts; here we drive cv / mtbf / mttr
// directly. (vi.mock is hoisted above the imports below.)
vi.mock('./tuning', () => ({
  stationDynamics: vi.fn(() => ({ cv: 0, mtbfSeconds: 0, mttrSeconds: 0 })),
}));

import { deriveSeed } from './rng';
import { newFactory, tick, tryPurchaseBuilding, type EngineBuilding, type EngineState } from './engine';
import { stationDynamics } from './tuning';
import type { BuildingDefinition, GameContent } from './types';

const mockDyn = vi.mocked(stationDynamics);

beforeEach(() => {
  mockDyn.mockReturnValue({ cv: 0, mtbfSeconds: 0, mttrSeconds: 0 });
});

function building(
  id: string,
  input: string | null,
  output: string,
  time: number,
): BuildingDefinition {
  return {
    id,
    name: id,
    inputResourceId: input,
    inputAmount: input ? 1 : 0,
    outputResourceId: output,
    outputAmount: 1,
    productionTimeSeconds: time,
    cost: 100,
    color: '#fff',
    shape: 'box',
    icon: id[0],
    sortOrder: 0,
  };
}

function makeContent(): GameContent {
  return {
    version: 1,
    resources: [
      { id: 'raw', name: 'Raw', tier: 0, baseValue: 1, color: '#fff', icon: 'r', sortOrder: 0 },
      { id: 'mid', name: 'Mid', tier: 1, baseValue: 5, color: '#fff', icon: 'm', sortOrder: 1 },
      { id: 'fin', name: 'Fin', tier: 2, baseValue: 20, color: '#fff', icon: 'f', sortOrder: 2 },
    ],
    buildings: [
      building('ex', null, 'raw', 2),
      building('mill', 'raw', 'mid', 3),
      building('fac', 'mid', 'fin', 4),
    ],
  };
}

function instance(id: string, seed: number, index: number): EngineBuilding {
  return {
    definitionId: id,
    progressSeconds: 0,
    cycleActive: false,
    cycleTargetSeconds: 0,
    timeToFailure: 0,
    downRemaining: 0,
    rngState: deriveSeed(seed, index),
  };
}

/** A factory holding one of each building, with ample input stock so none starve. */
function fullLine(seed: number): EngineState {
  return {
    cash: 0,
    lifetimeRevenue: 0,
    inventory: { raw: 100000, mid: 100000 },
    buildings: [instance('ex', seed, 0), instance('mill', seed, 1), instance('fac', seed, 2)],
    elapsedSeconds: 0,
    rngSeed: seed,
  };
}

describe('determinism (offline catch-up == live play)', () => {
  it('one large tick matches many small ticks (variance on, no breakdowns)', () => {
    mockDyn.mockReturnValue({ cv: 0.5, mtbfSeconds: 0, mttrSeconds: 0 });
    const content = makeContent();

    const single = fullLine(777);
    tick(single, 600, content);

    const chunked = fullLine(777);
    for (let i = 0; i < 600 / 0.25; i++) tick(chunked, 0.25, content);

    // Cycle-count-driven outcomes are exact; each building's private RNG stream
    // ends in the identical state because draws happen at the same logical events.
    expect(chunked.cash).toBe(single.cash);
    expect(chunked.lifetimeRevenue).toBe(single.lifetimeRevenue);
    expect(chunked.inventory).toEqual(single.inventory);
    for (let i = 0; i < single.buildings.length; i++) {
      expect(chunked.buildings[i].rngState).toBe(single.buildings[i].rngState);
    }
  });

  it('stays consistent with breakdowns active (within a tight tolerance)', () => {
    mockDyn.mockReturnValue({ cv: 0.5, mtbfSeconds: 40, mttrSeconds: 6 });
    const content = makeContent();

    const single = fullLine(31337);
    tick(single, 3600, content);

    const chunked = fullLine(31337);
    for (let i = 0; i < 3600 / 0.25; i++) tick(chunked, 0.25, content);

    expect(chunked.cash).toBeCloseTo(single.cash, -1); // within ~one cycle's revenue
    expect(chunked.lifetimeRevenue).toBeCloseTo(single.lifetimeRevenue, -1);
  });
});

describe('backward compatibility (cv = 0, mtbf = 0 reproduces v1)', () => {
  it('produces exactly one unit per nominal cycle and never breaks down', () => {
    const content = makeContent();
    const state = newFactory(content); // single cheapest extractor (ex, cycle 2s)

    tick(state, 100, content);

    expect(state.inventory.raw).toBe(50); // floor(100 / 2)
    expect(state.buildings.every((b) => b.downRemaining === 0)).toBe(true);
  });
});

describe('production-time variance', () => {
  it('preserves the mean cycle time over many cycles', () => {
    mockDyn.mockReturnValue({ cv: 0.5, mtbfSeconds: 0, mttrSeconds: 0 });
    const content = makeContent();
    const state = newFactory(content); // extractor, nominal 2s/cycle
    const T = 200000;

    tick(state, T, content);

    const avgCycle = T / state.inventory.raw;
    expect(avgCycle).toBeGreaterThan(1.9);
    expect(avgCycle).toBeLessThan(2.1);
  });
});

describe('reliability / uptime', () => {
  it('long-run throughput reflects availability = mtbf / (mtbf + mttr)', () => {
    mockDyn.mockReturnValue({ cv: 0, mtbfSeconds: 100, mttrSeconds: 25 }); // 80% available
    const content = makeContent();
    const state = newFactory(content); // extractor, 2s/cycle
    const T = 400000;

    tick(state, T, content);

    const expected = (T * (100 / 125)) / 2; // availability × nominal throughput
    const ratio = state.inventory.raw / expected;
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
  });
});

describe('starvation', () => {
  it('a station with no upstream supply never produces', () => {
    const content: GameContent = {
      version: 1,
      resources: makeContent().resources,
      buildings: [building('mill', 'raw', 'mid', 3)], // needs raw, nothing makes it
    };
    const state: EngineState = {
      cash: 500,
      lifetimeRevenue: 0,
      inventory: {},
      buildings: [instance('mill', 1, 0)],
      elapsedSeconds: 0,
      rngSeed: 1,
    };

    tick(state, 100, content);

    expect(state.inventory.mid ?? 0).toBe(0);
    expect(state.cash).toBe(500);
    expect(state.buildings[0].cycleActive).toBe(false);
  });

  it('purchased buildings get an independent RNG stream', () => {
    const content = makeContent();
    const state = newFactory(content);
    expect(tryPurchaseBuilding(state, 'mill', content)).toBe(true);
    expect(state.buildings[1].rngState).not.toBe(state.buildings[0].rngState);
  });
});
