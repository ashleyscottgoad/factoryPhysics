import { useEffect, useRef, useState } from 'react';
import { fetchContent, fetchState, purchaseBuilding } from './api';
import { FactoryCanvas } from './FactoryCanvas';
import type { GameContent, GameState } from './types';

const POLL_MS = 1000;

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function App() {
  const [content, setContent] = useState<GameContent | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<GameState | null>(null);

  useEffect(() => {
    fetchContent().then(setContent).catch((e) => setError(String(e)));

    const poll = async () => {
      try {
        const s = await fetchState();
        stateRef.current = s;
        setState(s);
        setError(null);
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
    return (
      <div className="app">
        <h1>Factory Physics</h1>
        <p className="error">API unreachable — is the backend running? ({error})</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>Factory Physics</h1>
        {state && (
          <div className="stats">
            <span className="stat">Cash: <strong>{money(state.cash)}</strong></span>
            <span className="stat">Lifetime revenue: <strong>{money(state.lifetimeRevenue)}</strong></span>
          </div>
        )}
      </header>

      {content && <FactoryCanvas content={content} stateRef={stateRef} />}

      {content && state && (
        <section className="shop">
          <h2>Build</h2>
          <div className="shop-grid">
            {content.buildings.map((def) => {
              const owned = state.buildings.filter((b) => b.definitionId === def.id).length;
              return (
                <button
                  key={def.id}
                  onClick={() => buy(def.id)}
                  disabled={state.cash < def.cost}
                >
                  <span className="shop-name">{def.name} <small>(x{owned})</small></span>
                  <span className="shop-detail">
                    {def.inputResourceId
                      ? `${def.inputAmount} ${def.inputResourceId} → ${def.outputAmount} ${def.outputResourceId}`
                      : `→ ${def.outputAmount} ${def.outputResourceId}`}
                    {' · '}{def.productionTimeSeconds}s
                  </span>
                  <span className="shop-cost">{money(def.cost)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
