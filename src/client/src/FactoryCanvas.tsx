import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { chainComponents, chainLabel } from './chains';
import type { GameContent, GameState } from './types';

const NODE_W = 160;
const NODE_H = 96;
const COL_X0 = 40;
const COL_GAP = 230; // NODE_W + edge room
const ROW_TOP = 16;
const ROW_LABEL_H = 26;
const ROW_H = ROW_LABEL_H + NODE_H + 78; // label + node + edge/inventory room
const DOTS_PER_EDGE = 4;

const SHAPE_RADIUS: Record<string, number> = {
  box: 3,
  rounded: 14,
  pill: NODE_H / 2,
};

function hexToNum(hex: string, fallback = 0x1d2433): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() ?? '');
  return m ? parseInt(m[1], 16) : fallback;
}

interface NodeView {
  countLabel: Text;
  progressFill: Graphics;
}

interface EdgeView {
  resourceId: string;
  dots: Graphics[];
  /** Polyline the dots travel along. */
  points: { x: number; y: number }[];
  segmentLengths: number[];
  totalLength: number;
  inventoryLabel: Text;
}

function pointAlong(
  points: { x: number; y: number }[],
  segmentLengths: number[],
  totalLength: number,
  t: number,
): { x: number; y: number } {
  let dist = t * totalLength;
  for (let i = 0; i < segmentLengths.length; i++) {
    const len = segmentLengths[i];
    if (dist <= len || i === segmentLengths.length - 1) {
      const a = points[i];
      const b = points[i + 1];
      const f = len > 0 ? Math.min(dist / len, 1) : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    dist -= len;
  }
  return points[points.length - 1];
}

interface NodePos {
  x: number;
  y: number;
}

/**
 * Column-adjacent nodes in the same row connect with a straight line; longer
 * hops route under the row (each in its own lane so they don't overlap).
 */
function edgePath(from: NodePos, to: NodePos, underLane: number): NodePos[] {
  const midY = from.y + NODE_H / 2;

  if (from.y === to.y && to.x - from.x === COL_GAP) {
    return [
      { x: from.x + NODE_W, y: midY },
      { x: to.x, y: midY },
    ];
  }

  const laneY = Math.max(from.y, to.y) + NODE_H + 28 + underLane * 14;
  return [
    { x: from.x + NODE_W / 2, y: from.y + NODE_H },
    { x: from.x + NODE_W / 2, y: laneY },
    { x: to.x + NODE_W / 2, y: laneY },
    { x: to.x + NODE_W / 2, y: to.y + NODE_H },
  ];
}

interface Props {
  content: GameContent;
  /** Latest polled state; read inside the render ticker without re-rendering React. */
  stateRef: React.RefObject<GameState | null>;
}

/**
 * Abstract node-graph view of the factory: one row per production chain, one
 * node per station styled by its admin-configured color/shape/icon, dots in
 * each product's color flowing along the edges, progress bars per node.
 */
export function FactoryCanvas({ content, stateRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const components = chainComponents(content.buildings);
    const rowCount = components.length ? Math.max(...components) + 1 : 0;

    // Per-building grid position: row = chain, column = order within chain.
    const colCounters = new Array<number>(rowCount).fill(0);
    const positions: NodePos[] = content.buildings.map((_, i) => {
      const row = components[i];
      const col = colCounters[row]++;
      return {
        x: COL_X0 + col * COL_GAP,
        y: ROW_TOP + row * ROW_H + ROW_LABEL_H,
      };
    });

    const maxCols = Math.max(1, ...colCounters);
    const width = Math.max(960, COL_X0 * 2 + (maxCols - 1) * COL_GAP + NODE_W);
    const height = Math.max(340, ROW_TOP + rowCount * ROW_H);

    let cancelled = false;
    const app = new Application();

    const setup = async () => {
      await app.init({
        width,
        height,
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

      const resourceById = new Map(content.resources.map((r) => [r.id, r]));
      const nodes = new Map<string, NodeView>();
      const edges: EdgeView[] = [];
      const edgeLayer = new Container();
      scene.addChild(edgeLayer); // edges render under the nodes

      // Row labels: the chain's end product.
      for (let row = 0; row < rowCount; row++) {
        const chain = content.buildings.filter((_, i) => components[i] === row);
        const product = chainLabel(chain, resourceById);
        const label = new Text({
          text: product ? `${product.icon} ${product.name}` : `Chain ${row + 1}`,
          style: { fill: 0x6b7689, fontSize: 13, fontWeight: '600' },
        });
        label.position.set(COL_X0, ROW_TOP + row * ROW_H);
        scene.addChild(label);
      }

      const underLanes = new Array<number>(rowCount).fill(0);

      content.buildings.forEach((def, i) => {
        // Edge from the nearest earlier producer of this building's input.
        if (def.inputResourceId) {
          let producerIndex = -1;
          for (let p = i - 1; p >= 0; p--) {
            if (content.buildings[p].outputResourceId === def.inputResourceId) {
              producerIndex = p;
              break;
            }
          }
          if (producerIndex < 0) {
            producerIndex = content.buildings.findIndex(
              (b, idx) => idx !== i && b.outputResourceId === def.inputResourceId,
            );
          }

          if (producerIndex >= 0) {
            const from = positions[producerIndex];
            const to = positions[i];
            const isStraight = from.y === to.y && to.x - from.x === COL_GAP;
            const points = edgePath(from, to, isStraight ? 0 : underLanes[components[i]]++);
            const resource = resourceById.get(def.inputResourceId);

            const line = new Graphics();
            line.moveTo(points[0].x, points[0].y);
            for (let p = 1; p < points.length; p++) {
              line.lineTo(points[p].x, points[p].y);
            }
            line.stroke({ width: 2, color: 0x2e374a });
            edgeLayer.addChild(line);

            const segmentLengths = points.slice(1).map((b, s) =>
              Math.hypot(b.x - points[s].x, b.y - points[s].y));
            const totalLength = segmentLengths.reduce((a, b) => a + b, 0);

            const labelPoint = pointAlong(points, segmentLengths, totalLength, 0.5);
            const inventoryLabel = new Text({
              text: '',
              style: { fill: 0x9aa4b8, fontSize: 12 },
            });
            inventoryLabel.anchor.set(0.5, 0);
            inventoryLabel.position.set(labelPoint.x, labelPoint.y + 8);
            scene.addChild(inventoryLabel);

            const dotColor = hexToNum(resource?.color ?? '', 0xf0b35c);
            const dots: Graphics[] = [];
            for (let d = 0; d < DOTS_PER_EDGE; d++) {
              const dot = new Graphics().circle(0, 0, 4).fill(dotColor);
              dot.visible = false;
              edgeLayer.addChild(dot);
              dots.push(dot);
            }

            edges.push({
              resourceId: def.inputResourceId,
              dots,
              points,
              segmentLengths,
              totalLength,
              inventoryLabel,
            });
          }
        }

        const { x, y } = positions[i];
        const radius = SHAPE_RADIUS[def.shape] ?? SHAPE_RADIUS.box;

        const box = new Graphics()
          .roundRect(0, 0, NODE_W, NODE_H, radius)
          .fill(hexToNum(def.color))
          .stroke({ width: 2, color: 0x3e4a61 });
        box.position.set(x, y);
        scene.addChild(box);

        const icon = new Text({ text: def.icon, style: { fontSize: 22 } });
        icon.anchor.set(1, 0);
        icon.position.set(x + NODE_W - 10, y + 8);
        scene.addChild(icon);

        const name = new Text({
          text: def.name,
          style: { fill: 0xe8eaf0, fontSize: 15, fontWeight: '600' },
        });
        name.position.set(x + 14, y + 12);
        scene.addChild(name);

        const countLabel = new Text({
          text: 'x0',
          style: { fill: 0xc8cfdc, fontSize: 13 },
        });
        countLabel.position.set(x + 14, y + 36);
        scene.addChild(countLabel);

        const progressBg = new Graphics()
          .roundRect(0, 0, NODE_W - 28, 8, 4)
          .fill(0x10131a);
        progressBg.alpha = 0.55;
        progressBg.position.set(x + 14, y + NODE_H - 22);
        scene.addChild(progressBg);

        const outputColor = hexToNum(
          resourceById.get(def.outputResourceId)?.color ?? '',
          0x4fc97e,
        );
        const progressFill = new Graphics().rect(0, 0, 1, 8).fill(outputColor);
        progressFill.position.set(x + 14, y + NODE_H - 22);
        progressFill.scale.x = 0;
        scene.addChild(progressFill);

        nodes.set(def.id, { countLabel, progressFill });
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
          view.progressFill.scale.x = avgProgress * (NODE_W - 28);
        }

        for (const edge of edges) {
          const units = state.inventory[edge.resourceId] ?? 0;
          const resource = resourceById.get(edge.resourceId);
          edge.inventoryLabel.text =
            `${resource?.icon ?? ''} ${units} ${resource?.name ?? edge.resourceId}`;
          const active = units > 0;
          edge.dots.forEach((dot, d) => {
            dot.visible = active;
            if (!active) return;
            const t = (phase + d / DOTS_PER_EDGE) % 1;
            const p = pointAlong(edge.points, edge.segmentLengths, edge.totalLength, t);
            dot.position.set(p.x, p.y);
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
