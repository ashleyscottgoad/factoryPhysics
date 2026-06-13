import type { BuildingDefinition, ResourceDefinition } from './types';

/**
 * Group buildings into connected production chains: two buildings belong to
 * the same chain when they touch a common resource (one's output is another's
 * input, or they share a supplier). Returns the chain index per building,
 * numbered in order of first appearance (so catalog order is preserved).
 */
export function chainComponents(buildings: BuildingDefinition[]): number[] {
  const parent = buildings.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  const firstTouching = new Map<string, number>();
  buildings.forEach((b, i) => {
    for (const r of [b.inputResourceId, b.outputResourceId]) {
      if (!r) continue;
      const prev = firstTouching.get(r);
      if (prev === undefined) {
        firstTouching.set(r, i);
      } else {
        union(i, prev);
      }
    }
  });

  const ids = new Map<number, number>();
  return buildings.map((_, i) => {
    const root = find(i);
    if (!ids.has(root)) ids.set(root, ids.size);
    return ids.get(root)!;
  });
}

/**
 * The balanced station counts per chain — the ratio that keeps every step fed
 * without piling up, maximizing throughput. Returns each building's ideal
 * relative count (e.g. a 4 : 3 : 2 chain maps farm→4, mill→3, bakery→2).
 *
 * Works backward from each chain's final product: the demand it places on the
 * step that feeds it sets that step's count, and so on up the chain. The real
 * (fractional) weights are then reduced to the smallest sensible whole-number
 * ratio.
 */
export function optimalRatios(buildings: BuildingDefinition[]): Map<string, number> {
  const components = chainComponents(buildings);
  const rowCount = components.length ? Math.max(...components) + 1 : 0;
  const result = new Map<string, number>();

  for (let row = 0; row < rowCount; row++) {
    const chain = buildings.filter((_, i) => components[i] === row);
    const weights = chainWeights(chain);
    const ideals = toIntegerRatio([...weights.values()]);
    let k = 0;
    for (const id of weights.keys()) {
      result.set(id, ideals[k++]);
    }
  }
  return result;
}

/** Real-valued balanced instance count per station, the final product = 1 reference. */
function chainWeights(chain: BuildingDefinition[]): Map<string, number> {
  const outputDemand = new Map<string, number>(); // resource → units/sec demanded downstream
  const weight = new Map<string, number>();

  // Consumers come after producers in chain order, so walk it in reverse: a
  // station's downstream demand is fully known by the time we reach it.
  for (let i = chain.length - 1; i >= 0; i--) {
    const b = chain[i];
    const prodRate = b.productionTimeSeconds > 0 ? b.outputAmount / b.productionTimeSeconds : 0;
    const demand = outputDemand.get(b.outputResourceId) ?? 0;
    const w = demand > 0 && prodRate > 0 ? demand / prodRate : 1; // no downstream demand ⇒ final product
    weight.set(b.id, w);

    if (b.inputResourceId && b.productionTimeSeconds > 0) {
      const consRate = (w * b.inputAmount) / b.productionTimeSeconds;
      outputDemand.set(b.inputResourceId, (outputDemand.get(b.inputResourceId) ?? 0) + consRate);
    }
  }

  // Re-key in chain order for stable display.
  const ordered = new Map<string, number>();
  for (const b of chain) ordered.set(b.id, weight.get(b.id) ?? 1);
  return ordered;
}

/** Smallest whole-number multiple of the weights that lands near integers. */
function toIntegerRatio(weights: number[]): number[] {
  const positive = weights.filter((w) => w > 0);
  if (positive.length === 0) return weights.map(() => 1);

  const min = Math.min(...positive);
  const norm = weights.map((w) => (w > 0 ? w / min : 1)); // smallest ≈ 1

  for (let m = 1; m <= 20; m++) {
    if (norm.every((w) => Math.abs(w * m - Math.round(w * m)) <= 0.06)) {
      return norm.map((w) => Math.max(1, Math.round(w * m)));
    }
  }
  return norm.map((w) => Math.max(1, Math.round(w)));
}

/** Display name for a chain: its end product (last finished output, else last output). */
export function chainLabel(
  chain: BuildingDefinition[],
  resourceById: Map<string, ResourceDefinition>,
): ResourceDefinition | undefined {
  for (let i = chain.length - 1; i >= 0; i--) {
    const r = resourceById.get(chain[i].outputResourceId);
    if (r?.tier === 2) return r;
  }
  return resourceById.get(chain[chain.length - 1]?.outputResourceId);
}
