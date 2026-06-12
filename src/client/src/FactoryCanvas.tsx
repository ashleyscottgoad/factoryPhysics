import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { GameContent, GameState } from './types';

const WIDTH = 960;
const HEIGHT = 320;
const NODE_W = 160;
const NODE_H = 96;
const NODE_Y = 120;
const COL_GAP = 230;
const COL_X0 = 40;
const DOTS_PER_EDGE = 4;

interface NodeView {
  countLabel: Text;
  progressFill: Graphics;
}

interface EdgeView {
  resourceId: string;
  dots: Graphics[];
  fromX: number;
  toX: number;
  inventoryLabel: Text;
  active: boolean;
}

interface Props {
  content: GameContent;
  /** Latest polled state; read inside the render ticker without re-rendering React. */
  stateRef: React.RefObject<GameState | null>;
}

/**
 * Abstract node-graph view of the production chain: one node per building
 * type, animated dots flowing along the edges, progress bars per node.
 */
export function FactoryCanvas({ content, stateRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    const app = new Application();

    const setup = async () => {
      await app.init({
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: 0x10131a,
        antialias: true,
      });
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }
      host.appendChild(app.canvas);

      const scene = new Container();
      app.stage.addChild(scene);

      const nodes = new Map<string, NodeView>();
      const edges: EdgeView[] = [];

      content.buildings.forEach((def, i) => {
        const x = COL_X0 + i * COL_GAP;

        const box = new Graphics()
          .roundRect(0, 0, NODE_W, NODE_H, 10)
          .fill(0x1d2433)
          .stroke({ width: 2, color: 0x3e4a61 });
        box.position.set(x, NODE_Y);
        scene.addChild(box);

        const name = new Text({
          text: def.name,
          style: { fill: 0xe8eaf0, fontSize: 15, fontWeight: '600' },
        });
        name.position.set(x + 12, NODE_Y + 10);
        scene.addChild(name);

        const countLabel = new Text({
          text: 'x0',
          style: { fill: 0x9aa4b8, fontSize: 13 },
        });
        countLabel.position.set(x + 12, NODE_Y + 34);
        scene.addChild(countLabel);

        const progressBg = new Graphics()
          .roundRect(0, 0, NODE_W - 24, 8, 4)
          .fill(0x2a3346);
        progressBg.position.set(x + 12, NODE_Y + NODE_H - 22);
        scene.addChild(progressBg);

        const progressFill = new Graphics().rect(0, 0, 1, 8).fill(0x4fc97e);
        progressFill.position.set(x + 12, NODE_Y + NODE_H - 22);
        progressFill.scale.x = 0;
        scene.addChild(progressFill);

        nodes.set(def.id, { countLabel, progressFill });

        // Edge from this node to the next one (the chain is ordered).
        if (i < content.buildings.length - 1) {
          const next = content.buildings[i + 1];
          const fromX = x + NODE_W;
          const toX = COL_X0 + (i + 1) * COL_GAP;
          const midY = NODE_Y + NODE_H / 2;

          const line = new Graphics()
            .moveTo(fromX, midY)
            .lineTo(toX, midY)
            .stroke({ width: 2, color: 0x2e374a });
          scene.addChild(line);

          const inventoryLabel = new Text({
            text: '',
            style: { fill: 0x9aa4b8, fontSize: 12 },
          });
          inventoryLabel.anchor.set(0.5, 0);
          inventoryLabel.position.set((fromX + toX) / 2, midY + 10);
          scene.addChild(inventoryLabel);

          const dots: Graphics[] = [];
          for (let d = 0; d < DOTS_PER_EDGE; d++) {
            const dot = new Graphics().circle(0, 0, 4).fill(0xf0b35c);
            dot.position.set(fromX, midY);
            dot.visible = false;
            scene.addChild(dot);
            dots.push(dot);
          }

          edges.push({
            resourceId: next.inputResourceId ?? def.outputResourceId,
            dots,
            fromX,
            toX,
            inventoryLabel,
            active: false,
          });
        }
      });

      let phase = 0;
      app.ticker.add((ticker) => {
        const state = stateRef.current;
        if (!state) return;

        phase = (phase + ticker.deltaMS / 2500) % 1;

        for (const def of content.buildings) {
          const view = nodes.get(def.id);
          if (!view) continue;
          const owned = state.buildings.filter((b) => b.definitionId === def.id);
          view.countLabel.text = `x${owned.length}`;
          const avgProgress = owned.length
            ? owned.reduce((sum, b) => sum + b.progress, 0) / owned.length
            : 0;
          view.progressFill.scale.x = avgProgress * (NODE_W - 24);
        }

        for (const edge of edges) {
          const units = state.inventory[edge.resourceId] ?? 0;
          edge.inventoryLabel.text = `${units} ${edge.resourceId}`;
          edge.active = units > 0;
          edge.dots.forEach((dot, d) => {
            dot.visible = edge.active;
            const t = (phase + d / DOTS_PER_EDGE) % 1;
            dot.x = edge.fromX + (edge.toX - edge.fromX) * t;
          });
        }
      });
    };

    void setup();

    return () => {
      cancelled = true;
      if (app.renderer) {
        app.destroy(true, { children: true });
      }
    };
  }, [content, stateRef]);

  return <div className="factory-canvas" ref={hostRef} />;
}
