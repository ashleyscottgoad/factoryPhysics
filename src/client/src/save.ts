// Save handling: the factory state lives in the browser. We keep two copies —
// localStorage (instant, offline) and the cloud (cross-device, durable) — and
// on load take whichever is newer. Each save carries the wall-clock time it was
// written so we can simulate the time the player was away.

import { loadCloudSave, pushCloudSave } from './api';
import { newFactory, tick, type EngineState } from './engine';
import type { GameContent } from './types';

const LOCAL_KEY = 'factory-save-v1';
const OFFLINE_CAP_SECONDS = 8 * 60 * 60; // catch-up is capped at 8 hours

export interface StoredSave {
  /** Date.now() when this save was written; drives offline catch-up. */
  savedAtMs: number;
  state: EngineState;
}

function readLocalSave(): StoredSave | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as StoredSave) : null;
  } catch {
    return null;
  }
}

export function writeLocalSave(state: EngineState): StoredSave {
  const save: StoredSave = { savedAtMs: Date.now(), state };
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(save));
  } catch {
    // storage full or blocked (private mode) — cloud save still covers us
  }
  return save;
}

export function clearLocalSave(): void {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    // ignore
  }
}

/**
 * Seed the starting state: take the newer of the local and cloud saves (or a
 * fresh factory if neither exists), then fast-forward the simulation by the
 * time elapsed since that save was written, capped at 8 hours.
 */
export async function loadInitialState(content: GameContent): Promise<EngineState> {
  const [local, cloud] = await Promise.all([
    Promise.resolve(readLocalSave()),
    loadCloudSave(),
  ]);

  const newest = [local, cloud]
    .filter((s): s is StoredSave => s !== null)
    .sort((a, b) => b.savedAtMs - a.savedAtMs)[0];

  if (!newest) return newFactory(content);

  const state = newest.state;
  const offlineSeconds = Math.min((Date.now() - newest.savedAtMs) / 1000, OFFLINE_CAP_SECONDS);
  tick(state, offlineSeconds, content);
  return state;
}

/** Persist to localStorage now and fire-and-forget the cloud push. */
export function saveBoth(state: EngineState): void {
  const save = writeLocalSave(state);
  void pushCloudSave(save);
}
