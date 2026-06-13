import { useEffect, useRef, useState } from 'react';
import { fetchContent } from './api';
import { tick, toGameState, tryPurchaseBuilding, type EngineState } from './engine';
import { loadInitialState, saveBoth, writeLocalSave } from './save';
import { FactoryCanvas } from './FactoryCanvas';
import type { GameContent, GameState } from './types';

const TICK_MS = 250;
const LOCAL_SAVE_MS = 5_000;
const CLOUD_SAVE_MS = 30_000;

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface MenuTarget {
  definitionId: string;
  x: number;
  y: number;
}

export function GamePage() {
  const [content, setContent] = useState<GameContent | null>(null);
  const [view, setView] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);

  // The simulation now runs in the browser; the server only stores saves.
  const engineRef = useRef<EngineState | null>(null);
  const contentRef = useRef<GameContent | null>(null);
  const stateRef = useRef<GameState | null>(null); // canvas-facing snapshot

  // Boot: load content, seed state (newest of local/cloud save + offline
  // catch-up), then run the tick loop and autosaves locally.
  useEffect(() => {
    let cancelled = false;
    let lastMs = performance.now();

    const publish = () => {
      const engine = engineRef.current;
      const c = contentRef.current;
      if (!engine || !c) return;
      const gs = toGameState(engine, c);
      stateRef.current = gs;
      setView(gs);
    };

    const boot = async () => {
      try {
        const c = await fetchContent();
        if (cancelled) return;
        contentRef.current = c;
        setContent(c);

        engineRef.current = await loadInitialState(c);
        if (cancelled) return;
        publish();
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    };
    void boot();

    const tickId = setInterval(() => {
      const engine = engineRef.current;
      const c = contentRef.current;
      const now = performance.now();
      const dt = (now - lastMs) / 1000;
      lastMs = now;
      if (engine && c) {
        tick(engine, dt, c);
        publish();
      }
    }, TICK_MS);

    const localId = setInterval(() => {
      if (engineRef.current) writeLocalSave(engineRef.current);
    }, LOCAL_SAVE_MS);
    const cloudId = setInterval(() => {
      if (engineRef.current) saveBoth(engineRef.current);
    }, CLOUD_SAVE_MS);

    const flush = () => {
      if (engineRef.current) saveBoth(engineRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
      else void refreshContent(); // admin may have edited while we were away
    };
    const refreshContent = async () => {
      try {
        const c = await fetchContent();
        contentRef.current = c;
        setContent(c);
      } catch {
        // keep the content we have
      }
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('focus', refreshContent);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(tickId);
      clearInterval(localId);
      clearInterval(cloudId);
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('focus', refreshContent);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const buy = (definitionId: string) => {
    const engine = engineRef.current;
    const c = contentRef.current;
    if (!engine || !c) return;
    if (tryPurchaseBuilding(engine, definitionId, c)) {
      const gs = toGameState(engine, c);
      stateRef.current = gs;
      setView(gs);
      writeLocalSave(engine); // a purchase is worth persisting immediately
    }
  };

  if (error && !view) {
    return <p className="error">Couldn't load the game ({error})</p>;
  }

  const menuDef = menu && content
    ? content.buildings.find((b) => b.id === menu.definitionId)
    : undefined;
  const menuOwned = menuDef && view
    ? view.buildings.filter((b) => b.definitionId === menuDef.id).length
    : 0;

  return (
    <>
      {view && (
        <div className="stats">
          <span className="stat">Cash: <strong>{money(view.cash)}</strong></span>
          <span className="stat">Lifetime revenue: <strong>{money(view.lifetimeRevenue)}</strong></span>
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

      {menu && menuDef && view && (
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
              disabled={view.cash < menuDef.cost}
              onClick={() => buy(menuDef.id)}
            >
              Build — {money(menuDef.cost)}
            </button>
            {view.cash < menuDef.cost && (
              <p className="shop-detail">Not enough cash ({money(view.cash)})</p>
            )}
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </>
  );
}
