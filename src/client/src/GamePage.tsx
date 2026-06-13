import { useEffect, useRef, useState } from 'react';
import { fetchContent, fetchState, purchaseBuilding } from './api';
import { FactoryCanvas } from './FactoryCanvas';
import type { GameContent, GameState } from './types';

const POLL_MS = 1000;

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface MenuTarget {
  definitionId: string;
  x: number;
  y: number;
}

export function GamePage() {
  const [content, setContent] = useState<GameContent | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
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

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const buy = async (definitionId: string) => {
    await purchaseBuilding(definitionId);
    // Next poll picks up the new building; menu stays open for repeat buys.
  };

  if (error && !state) {
    return <p className="error">API unreachable — is the backend running? ({error})</p>;
  }

  const menuDef = menu && content
    ? content.buildings.find((b) => b.id === menu.definitionId)
    : undefined;
  const menuOwned = menuDef && state
    ? state.buildings.filter((b) => b.definitionId === menuDef.id).length
    : 0;

  return (
    <>
      {state && (
        <div className="stats">
          <span className="stat">Cash: <strong>{money(state.cash)}</strong></span>
          <span className="stat">Lifetime revenue: <strong>{money(state.lifetimeRevenue)}</strong></span>
        </div>
      )}

      {content && (
        <FactoryCanvas
          content={content}
          stateRef={stateRef}
          onStationMenu={(definitionId, x, y) => setMenu({ definitionId, x, y })}
        />
      )}

      <p className="hint">
        Tap a station to build more of it. Amber = starved of input; red = build
        more of this station to fix the flow.
      </p>

      {menu && menuDef && state && (
        <>
          <div
            className="menu-backdrop"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            className="station-menu"
            style={{
              left: Math.min(menu.x, window.innerWidth - 260),
              top: Math.min(menu.y, window.innerHeight - 170),
            }}
          >
            <header>
              {menuDef.icon} {menuDef.name} <small>x{menuOwned} built</small>
            </header>
            <p className="shop-detail">
              {menuDef.inputResourceId
                ? `${menuDef.inputAmount} ${menuDef.inputResourceId} → ${menuDef.outputAmount} ${menuDef.outputResourceId}`
                : `→ ${menuDef.outputAmount} ${menuDef.outputResourceId}`}
              {' · '}{menuDef.productionTimeSeconds}s per cycle
            </p>
            <button
              className="primary"
              disabled={state.cash < menuDef.cost}
              onClick={() => buy(menuDef.id)}
            >
              Build — {money(menuDef.cost)}
            </button>
            {state.cash < menuDef.cost && (
              <p className="shop-detail">Not enough cash ({money(state.cash)})</p>
            )}
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </>
  );
}
