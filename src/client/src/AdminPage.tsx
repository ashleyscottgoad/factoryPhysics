import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchContent, resetContent, resetGame, saveContent } from './api';
import { FactoryCanvas } from './FactoryCanvas';
import type {
  BuildingDefinition,
  BuildingShape,
  GameContent,
  GameState,
  RecipeInput,
  ResourceDefinition,
  ResourceTier,
} from './types';
import { TIER_NAMES } from './types';

const SHAPES: BuildingShape[] = ['box', 'rounded', 'pill'];

function move<T>(arr: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= arr.length) return arr;
  const copy = [...arr];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/** Synthetic state so the preview canvas animates: one of each building, stocked edges. */
function makePreviewState(content: GameContent): GameState {
  const inventory: Record<string, number> = {};
  for (const b of content.buildings) {
    for (const inp of b.inputs) {
      inventory[inp.resourceId] = Math.max(inventory[inp.resourceId] ?? 0, inp.amount * 3);
    }
  }
  return {
    contentVersion: content.version,
    cash: 0,
    lifetimeRevenue: 0,
    elapsedSeconds: 0,
    inventory,
    buildings: content.buildings.map((b) => ({
      definitionId: b.id,
      cycleActive: true,
      progress: 0.6,
    })),
  };
}

export function AdminPage() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('adminKey') ?? '');
  const [resources, setResources] = useState<ResourceDefinition[]>([]);
  const [buildings, setBuildings] = useState<BuildingDefinition[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchContent()
      .then((c) => {
        setResources(c.resources);
        setBuildings(c.buildings);
        setLoaded(true);
      })
      .catch((e) => setErrors([String(e)]));
  }, []);

  useEffect(() => {
    sessionStorage.setItem('adminKey', adminKey);
  }, [adminKey]);

  // Debounced preview so the Pixi scene isn't rebuilt on every keystroke.
  const draftContent = useMemo<GameContent>(
    () => ({ version: 0, resources, buildings }),
    [resources, buildings],
  );
  const [previewContent, setPreviewContent] = useState<GameContent | null>(null);
  const previewStateRef = useRef<GameState | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      previewStateRef.current = makePreviewState(draftContent);
      setPreviewContent(draftContent);
    }, 600);
    return () => clearTimeout(t);
  }, [draftContent]);

  const patchResource = (i: number, patch: Partial<ResourceDefinition>) =>
    setResources((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const patchBuilding = (i: number, patch: Partial<BuildingDefinition>) =>
    setBuildings((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const patchInput = (i: number, j: number, patch: Partial<RecipeInput>) =>
    setBuildings((bs) => bs.map((b, idx) => (idx === i
      ? { ...b, inputs: b.inputs.map((inp, k) => (k === j ? { ...inp, ...patch } : inp)) }
      : b)));

  const addInput = (i: number) =>
    setBuildings((bs) => bs.map((b, idx) => (idx === i
      ? {
          ...b,
          inputs: [
            ...b.inputs,
            // Default to the first resource this recipe doesn't use yet.
            {
              resourceId:
                resources.find((r) => !b.inputs.some((inp) => inp.resourceId === r.id))?.id
                ?? resources[0]?.id ?? '',
              amount: 1,
            },
          ],
        }
      : b)));

  const removeInput = (i: number, j: number) =>
    setBuildings((bs) => bs.map((b, idx) => (idx === i
      ? { ...b, inputs: b.inputs.filter((_, k) => k !== j) }
      : b)));

  const addResource = () =>
    setResources((rs) => [
      ...rs,
      {
        id: `resource-${rs.length + 1}`,
        name: 'New Resource',
        tier: 1 as ResourceTier,
        baseValue: 1,
        color: '#9aa4b8',
        icon: '📦',
        sortOrder: rs.length,
      },
    ]);

  const addBuilding = () =>
    setBuildings((bs) => [
      ...bs,
      {
        id: `building-${bs.length + 1}`,
        name: 'New Building',
        inputs: resources[0] ? [{ resourceId: resources[0].id, amount: 1 }] : [],
        outputResourceId: resources[resources.length - 1]?.id ?? '',
        outputAmount: 1,
        productionTimeSeconds: 5,
        cost: 100,
        color: '#1d2433',
        shape: 'box' as BuildingShape,
        icon: '🏭',
        sortOrder: bs.length,
      },
    ]);

  const withResult = async (action: () => Promise<{ ok: boolean; errors: string[] }>, okMessage: string) => {
    setStatus(null);
    setErrors([]);
    const result = await action();
    if (result.ok) {
      setStatus(okMessage);
    } else {
      setErrors(result.errors);
    }
  };

  const save = () =>
    withResult(
      () =>
        saveContent(
          resources.map((r, i) => ({ ...r, sortOrder: i })),
          buildings.map((b, i) => ({ ...b, sortOrder: i })),
          adminKey,
        ),
      'Content saved. The factory picks it up immediately.',
    );

  const doResetContent = async () => {
    if (!confirm('Replace all recipes and graphics with the built-in defaults?')) return;
    await withResult(() => resetContent(adminKey), 'Content reset to defaults.');
    const c = await fetchContent();
    setResources(c.resources);
    setBuildings(c.buildings);
  };

  const doResetGame = async () => {
    if (!confirm('Restart the factory? Cash, buildings, and inventory all reset.')) return;
    await withResult(() => resetGame(adminKey), 'Factory restarted.');
  };

  if (!loaded && errors.length === 0) {
    return <p>Loading content…</p>;
  }

  return (
    <div className="admin">
      <section className="admin-key">
        <label>
          Admin key{' '}
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="from the AdminKey app setting"
          />
        </label>
        <span className="hint">
          Checked on save. Locally (no key configured) admin is open in dev mode.
        </span>
      </section>

      <section>
        <h2>Products</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th></th><th>Icon</th><th>Name</th><th>Id</th><th>Tier</th>
              <th>Value $</th><th>Color</th><th></th>
            </tr>
          </thead>
          <tbody>
            {resources.map((r, i) => (
              <tr key={i}>
                <td className="reorder">
                  <button onClick={() => setResources((rs) => move(rs, i, -1))}>↑</button>
                  <button onClick={() => setResources((rs) => move(rs, i, 1))}>↓</button>
                </td>
                <td><input className="icon-input" value={r.icon}
                  onChange={(e) => patchResource(i, { icon: e.target.value })} /></td>
                <td><input value={r.name}
                  onChange={(e) => patchResource(i, { name: e.target.value })} /></td>
                <td><input className="id-input" value={r.id}
                  onChange={(e) => patchResource(i, { id: e.target.value })} /></td>
                <td>
                  <select value={r.tier}
                    onChange={(e) => patchResource(i, { tier: Number(e.target.value) as ResourceTier })}>
                    {([0, 1, 2] as ResourceTier[]).map((t) => (
                      <option key={t} value={t}>{TIER_NAMES[t]}</option>
                    ))}
                  </select>
                </td>
                <td><input type="number" min="0" step="any" className="num-input" value={r.baseValue}
                  onChange={(e) => patchResource(i, { baseValue: Number(e.target.value) || 0 })} /></td>
                <td><input type="color" value={r.color}
                  onChange={(e) => patchResource(i, { color: e.target.value })} /></td>
                <td><button className="danger" onClick={() =>
                  setResources((rs) => rs.filter((_, idx) => idx !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addResource}>+ Add product</button>
        <p className="hint">
          Finished-tier products auto-sell for their value; that's the game's only revenue.
        </p>
      </section>

      <section>
        <h2>Stations (recipes)</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th></th><th>Icon</th><th>Name</th><th>Id</th><th>Input</th><th>Output</th>
              <th>Time s</th><th>Cost $</th><th>Shape</th><th>Color</th><th></th>
            </tr>
          </thead>
          <tbody>
            {buildings.map((b, i) => (
              <tr key={i}>
                <td className="reorder">
                  <button onClick={() => setBuildings((bs) => move(bs, i, -1))}>↑</button>
                  <button onClick={() => setBuildings((bs) => move(bs, i, 1))}>↓</button>
                </td>
                <td><input className="icon-input" value={b.icon}
                  onChange={(e) => patchBuilding(i, { icon: e.target.value })} /></td>
                <td><input value={b.name}
                  onChange={(e) => patchBuilding(i, { name: e.target.value })} /></td>
                <td><input className="id-input" value={b.id}
                  onChange={(e) => patchBuilding(i, { id: e.target.value })} /></td>
                <td className="recipe-cell">
                  {b.inputs.length === 0 && <span className="hint">(none — extractor)</span>}
                  {b.inputs.map((inp, j) => (
                    <div key={j} className="recipe-input-row">
                      <select value={inp.resourceId}
                        onChange={(e) => patchInput(i, j, { resourceId: e.target.value })}>
                        {resources.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      <input type="number" min="1" className="num-input" value={inp.amount}
                        onChange={(e) => patchInput(i, j, { amount: Number(e.target.value) || 1 })} />
                      <button className="danger" onClick={() => removeInput(i, j)}>✕</button>
                    </div>
                  ))}
                  <button className="add-input" onClick={() => addInput(i)}>+ input</button>
                </td>
                <td className="recipe-cell">
                  <select value={b.outputResourceId}
                    onChange={(e) => patchBuilding(i, { outputResourceId: e.target.value })}>
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <input type="number" min="1" className="num-input" value={b.outputAmount}
                    onChange={(e) => patchBuilding(i, { outputAmount: Number(e.target.value) || 1 })} />
                </td>
                <td><input type="number" min="0.1" step="any" className="num-input" value={b.productionTimeSeconds}
                  onChange={(e) => patchBuilding(i, { productionTimeSeconds: Number(e.target.value) || 1 })} /></td>
                <td><input type="number" min="0" step="any" className="num-input" value={b.cost}
                  onChange={(e) => patchBuilding(i, { cost: Number(e.target.value) || 0 })} /></td>
                <td>
                  <select value={b.shape}
                    onChange={(e) => patchBuilding(i, { shape: e.target.value as BuildingShape })}>
                    {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td><input type="color" value={b.color}
                  onChange={(e) => patchBuilding(i, { color: e.target.value })} /></td>
                <td><button className="danger" onClick={() =>
                  setBuildings((bs) => bs.filter((_, idx) => idx !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addBuilding}>+ Add station</button>
        <p className="hint">
          Station order = chain order (left to right in the factory view). Throughput
          is output amount ÷ time; renaming an id orphans already-built stations.
        </p>
      </section>

      <section>
        <h2>Preview</h2>
        {previewContent && (
          <FactoryCanvas
            key={JSON.stringify(previewContent)}
            content={previewContent}
            stateRef={previewStateRef}
          />
        )}
      </section>

      <section className="admin-actions">
        <button className="primary" onClick={save}>Save content</button>
        <button onClick={doResetContent}>Reset content to defaults</button>
        <button className="danger" onClick={doResetGame}>Restart factory</button>
      </section>

      {status && <p className="status">{status}</p>}
      {errors.length > 0 && (
        <ul className="error">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
