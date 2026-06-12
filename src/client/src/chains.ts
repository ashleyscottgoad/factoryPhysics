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
    for (const r of [...b.inputs.map((inp) => inp.resourceId), b.outputResourceId]) {
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
