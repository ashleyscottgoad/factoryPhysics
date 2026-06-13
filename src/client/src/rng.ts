// Seeded pseudo-random generator and the distribution helpers the simulation
// draws from. Everything here is pure: a generator is just a 32-bit unsigned
// integer state, and each draw returns the value plus the *next* state. State
// is therefore explicit, serializable into saves, and reproducible — the same
// seed always replays the same sequence, which is what lets an 8-hour offline
// catch-up land on the same result as thousands of live ticks.

/** A draw: the value in [0, 1) and the advanced generator state. */
export interface Draw {
  value: number;
  state: number;
}

/** mulberry32 — a small, fast, well-distributed 32-bit PRNG step. */
export function nextU32(state: number): Draw {
  let s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s >>> 0 };
}

/** Derive a fresh, well-separated child seed from a parent state (for per-building streams). */
export function deriveSeed(parent: number, salt: number): number {
  return nextU32((parent ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0).state;
}

/** A standard normal sample via the Box–Muller transform. */
function standardNormal(state: number): Draw {
  const u1 = nextU32(state);
  const u2 = nextU32(u1.state);
  // Guard the log against an exact zero from u1.
  const mag = Math.sqrt(-2 * Math.log(u1.value || Number.MIN_VALUE));
  const value = mag * Math.cos(2 * Math.PI * u2.value);
  return { value, state: u2.state };
}

/**
 * A cycle time around `mean` with coefficient of variation `cv` (SCV = cv²).
 * Lognormal so the result is always positive and the distribution is mean-
 * preserving; clamped to a small floor to avoid pathological near-zero cycles.
 * `cv <= 0` collapses to the deterministic mean (v1 behavior).
 */
export function drawCycleTime(mean: number, cv: number, state: number): Draw {
  if (mean <= 0) return { value: 0, state };
  if (cv <= 0) return { value: mean, state };

  const sigma2 = Math.log(1 + cv * cv);
  const sigma = Math.sqrt(sigma2);
  const mu = Math.log(mean) - sigma2 / 2;
  const z = standardNormal(state);
  const sample = Math.exp(mu + sigma * z.value);
  return { value: Math.max(sample, mean * 0.1), state: z.state };
}

/** An exponential sample with the given mean (memoryless). */
function drawExponential(mean: number, state: number): Draw {
  if (mean <= 0) return { value: 0, state };
  const u = nextU32(state);
  // 1 - u keeps the argument in (0, 1]; never log(0). Floor the result to a
  // tiny positive so a zero-length interval can't stall the step loop.
  return { value: Math.max(-mean * Math.log(1 - u.value), mean * 1e-6), state: u.state };
}

/**
 * Operating seconds until the next breakdown, exponential about `mtbfSeconds`.
 * `mtbfSeconds <= 0` means the station never breaks (returns Infinity).
 */
export function drawFailureInterval(mtbfSeconds: number, state: number): Draw {
  if (mtbfSeconds <= 0) return { value: Infinity, state };
  return drawExponential(mtbfSeconds, state);
}

/** Repair duration, exponential about `mttrSeconds`. */
export function drawRepairTime(mttrSeconds: number, state: number): Draw {
  return drawExponential(mttrSeconds, state);
}
