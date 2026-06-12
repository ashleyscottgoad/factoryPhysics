import type { BuildingDefinition, GameContent, GameState, ResourceDefinition } from './types';

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

// --- Admin (X-Admin-Key checked server-side) ---

export interface AdminResult {
  ok: boolean;
  /** Validation messages or an error description when !ok. */
  errors: string[];
}

async function adminCall(
  path: string,
  method: string,
  adminKey: string,
  body?: unknown,
): Promise<AdminResult> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'X-Admin-Key': adminKey,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.ok) {
    return { ok: true, errors: [] };
  }
  if (res.status === 401) {
    return { ok: false, errors: ['Wrong admin key.'] };
  }

  try {
    const data = await res.json();
    if (Array.isArray(data?.errors)) {
      return { ok: false, errors: data.errors };
    }
    if (typeof data?.detail === 'string') {
      return { ok: false, errors: [data.detail] };
    }
  } catch {
    // fall through to generic message
  }
  return { ok: false, errors: [`${path} failed: ${res.status}`] };
}

export const saveContent = (
  resources: ResourceDefinition[],
  buildings: BuildingDefinition[],
  adminKey: string,
) => adminCall('/api/admin/content', 'PUT', adminKey, { resources, buildings });

export const resetContent = (adminKey: string) =>
  adminCall('/api/admin/content/reset', 'POST', adminKey);

export const resetGame = (adminKey: string) =>
  adminCall('/api/admin/game/reset', 'POST', adminKey);
