import type { BuildingDefinition, GameContent, ResourceDefinition } from './types';
import type { StoredSave } from './save';

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

/** Read the cloud save, or null if none exists / the server is unreachable. */
export async function loadCloudSave(): Promise<StoredSave | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/save`);
  } catch {
    return null; // offline: fall back to the local save
  }
  if (res.status === 204 || !res.ok) return null;
  const body = (await res.json()) as { stateJson: string };
  try {
    return JSON.parse(body.stateJson) as StoredSave;
  } catch {
    return null;
  }
}

/** Push the full save to the cloud. Best-effort; swallows transient failures. */
export async function pushCloudSave(save: StoredSave): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/save`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stateJson: JSON.stringify(save) }),
    });
    return res.ok;
  } catch {
    return false;
  }
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
