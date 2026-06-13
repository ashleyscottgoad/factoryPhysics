// Per-station dynamics: how variable a station's cycle time is, and how often
// it breaks down. Milestone 2 keeps these as lean, engine-side constants
// derived from each station's own cycle time rather than as admin-editable
// content — one knob set, in one place, so the Milestone 8 tuning pass has a
// single file to retune. Setting cv = 0 / mtbf = 0 recovers exact v1 behavior.

import type { BuildingDefinition } from './types';

export interface StationDynamics {
  /** Coefficient of variation of the cycle time (SCV = cv²). */
  cv: number;
  /** Mean operating seconds between breakdowns; 0 ⇒ never breaks. */
  mtbfSeconds: number;
  /** Mean repair seconds once broken down. */
  mttrSeconds: number;
}

// --- Tuning constants (starting points; revisit in Milestone 8) -------------
// Moderate variability and ~94% availability scaled to each station's pace, so
// faster stations break more often but recover proportionally faster.
const CYCLE_TIME_CV = 0.5;
const MTBF_CYCLES = 30; // mean uptime ≈ 30 nominal cycles of work
const MTTR_CYCLES = 2; //  mean repair  ≈  2 nominal cycles of work
// Availability ≈ MTBF / (MTBF + MTTR) = 30 / 32 ≈ 0.94.

export function stationDynamics(def: BuildingDefinition): StationDynamics {
  const cycle = def.productionTimeSeconds;
  if (cycle <= 0) {
    return { cv: 0, mtbfSeconds: 0, mttrSeconds: 0 };
  }
  return {
    cv: CYCLE_TIME_CV,
    mtbfSeconds: MTBF_CYCLES * cycle,
    mttrSeconds: MTTR_CYCLES * cycle,
  };
}
