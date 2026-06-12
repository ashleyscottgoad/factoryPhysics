import type { GameContent, GameState } from './types';

// Same-origin '/api' in dev (Vite proxy). In production, set VITE_API_BASE_URL
// to the App Service URL at build time.
const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const fetchContent = () => getJson<GameContent>('/api/content');

export const fetchState = () => getJson<GameState>('/api/state');

export async function purchaseBuilding(definitionId: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/buildings/${definitionId}`, { method: 'POST' });
  return res.ok;
}
