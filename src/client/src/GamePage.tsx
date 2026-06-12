import { useEffect, useRef, useState } from 'react';
import { fetchContent, fetchState, purchaseBuilding } from './api';
import { chainComponents, chainLabel } from './chains';
import { FactoryCanvas } from './FactoryCanvas';
import type { BuildingDefinition, GameContent, GameState, ResourceDefinition } from './types';

const POLL_MS = 1000;

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface ChainGroup {
  product: ResourceDefinition | undefined;
  buildings: BuildingDefinition[];
}

function groupChains(content: GameContent): ChainGroup[] {
  const components = chainComponents(content.buildings);
  const resourceById = new Map(content.resources.map((r) => [r.id, r]));
  const groups: BuildingDefinition[][] = [];
  content.buildings.forEach((b, i) => {
    (groups[components[i]] ??= []).push(b);
  });
  return groups.map((buildings) => ({
    product: chainLabel(buildings, resourceById),
    buildings,
  }));
}

export function GamePage() {
  const [content, setContent] = useState<GameContent | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const contentVersionRef = useRef(0);

  useEffect(() => {
    const loadContent = () =>
      fetchContent()
        .then((c) => {
          contentVersionRef.current = c.version;
          setContent(c);
        })
        .catch((e) => setError(String(e)));

    void loadContent();

    const poll = async () => {
      try {
        const s = await fetchState();
        stateRef.current = s;
        setState(s);
        setError(null);
        // An admin edited recipes/graphics since our last content fetch.
        if (s.contentVersion !== contentVersionRef.current) {
          void loadContent();
        }
      } catch (e) {
        setError(String(e));
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const buy = async (definitionId: string) => {
    await purchaseBuilding(definitionId);
    // Next poll picks up the new building; no optimistic update needed at 1s cadence.
  };

  if (error && !state) {
    return <p className="error">API unreachable — is the backend running? ({error})</p>;
  }

  return (
    <>
      {state && (
        <div className="stats">
          <span className="stat">Cash: <strong>{money(state.cash)}</strong></span>
          <span className="stat">Lifetime revenue: <strong>{money(state.lifetimeRevenue)}</strong></span>
        </div>
      )}

      {content && <FactoryCanvas content={content} stateRef={stateRef} />}

      {content && state && (
        <section className="shop">
          <h2>Build</h2>
          {groupChains(content).map(({ product, buildings }, g) => (
            <div key={g} className="shop-chain">
              <h3>{product ? `${product.icon} ${product.name}` : `Chain ${g + 1}`}</h3>
              <div className="shop-grid">
                {buildings.map((def) => {
                  const owned = state.buildings.filter((b) => b.definitionId === def.id).length;
                  return (
                    <button
                      key={def.id}
                      onClick={() => buy(def.id)}
                      disabled={state.cash < def.cost}
                    >
                      <span className="shop-name">
                        {def.icon} {def.name} <small>(x{owned})</small>
                      </span>
                      <span className="shop-detail">
                        {def.inputs.length
                          ? `${def.inputs
                              .map((inp) => `${inp.amount} ${inp.resourceId}`)
                              .join(' + ')} → ${def.outputAmount} ${def.outputResourceId}`
                          : `→ ${def.outputAmount} ${def.outputResourceId}`}
                        {' · '}{def.productionTimeSeconds}s
                      </span>
                      <span className="shop-cost">{money(def.cost)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </>
  );
}
