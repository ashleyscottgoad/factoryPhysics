import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { BuildingDefinition, GameContent, GameState } from './types';

const HEIGHT = 340;
const NODE_W = 160;
const NODE_H = 96;
const NODE_Y = 110;
const COL_X0 = 40;
const COL_GAP = 230; // NODE_W + edge room
const DOTS_PER_EDGE = 4;
const UNDER_LANE_Y = NODE_Y + NODE_H + 46;

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

/**
 * Adjacent columns connect with a straight line; longer or backward hops
 * route under the node row (each in its own lane so they don't overlap).
 */
function edgePath(
  producerIndex: number,
  consumerIndex: number,
  underLane: number,
): { x: number; y: number }[] {
  const midY = NODE_Y + NODE_H / 2;

  if (consumerIndex - producerIndex === 1) {
    return [
      { x: COL_X0 + producerIndex * COL_GAP + NODE_W, y: midY },
      { x: COL_X0 + consumerIndex * COL_GAP, y: midY },
    ];
  }

  const laneY = UNDER_LANE_Y + underLane * 16;
  const fromCx = COL_X0 + producerIndex * COL_GAP + NODE_W / 2;
  const toCx = COL_X0 + consumerIndex * COL_GAP + NODE_W / 2;
  return [
    { x: fromCx, y: NODE_Y + NODE_H },
    { x: fromCx, y: laneY },
    { x: toCx, y: laneY },
    { x: toCx, y: NODE_Y + NODE_H },
  ];
}

/** Nearest producer of the consumer's input earlier in the chain, else any producer. */
function findProducerIndex(buildings: BuildingDefinition[], consumerIndex: number): number {
  const input = buildings[consumerIndex].inputResourceId;
  if (!input) return -1;
  for (let i = consumerIndex - 1; i >= 0; i--) {
    if (buildings[i].outputResourceId === input) return i;
  }
  return buildings.findIndex((b, i) => i !== consumerIndex && b.outputResourceId === input);
}

interface Props {
  content: GameContent;
  /** Latest polled state; read inside the render ticker without re-rendering React. */
  stateRef: React.RefObject<GameState | null>;
}

/**
 * Abstract node-graph view of the production chain: one node per building
 * type styled by its admin-configured color/shape/icon, dots in each
 * product's color flowing along the edges, progress bars per node.
 */
export function FactoryCanvas({ content, stateRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const width = Math.max(
      960,
      COL_X0 * 2 + Math.max(content.buildings.length - 1, 0) * COL_GAP + NODE_W,
    );

    let cancelled = false;
    const app = new Application();

    const setup = async () => {
      await app.init({
        width,
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

      const resourceById = new Map(content.resources.map((r) => [r.id, r]));
      const nodes = new Map<string, NodeView>();
      const edges: EdgeView[] = [];
      const edgeLayer = new Container();
      scene.addChild(edgeLayer); // edges render under the nodes

      let underLane = 0;
      content.buildings.forEach((def, i) => {
        const producerIndex = findProducerIndex(content.buildings, i);
        if (producerIndex >= 0 && def.inputResourceId) {
          const isAdjacent = i - producerIndex === 1;
          const points = edgePath(producerIndex, i, isAdjacent ? 0 : underLane++);
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

        const x = COL_X0 + i * COL_GAP;
        const radius = SHAPE_RADIUS[def.shape] ?? SHAPE_RADIUS.box;

        const box = new Graphics()
          .roundRect(0, 0, NODE_W, NODE_H, radius)
          .fill(hexToNum(def.color))
          .stroke({ width: 2, color: 0x3e4a61 });
        box.position.set(x, NODE_Y);
        scene.addChild(box);

        const icon = new Text({ text: def.icon, style: { fontSize: 22 } });
        icon.anchor.set(1, 0);
        icon.position.set(x + NODE_W - 10, NODE_Y + 8);
        scene.addChild(icon);

        const name = new Text({
          text: def.name,
          style: { fill: 0xe8eaf0, fontSize: 15, fontWeight: '600' },
        });
        name.position.set(x + 14, NODE_Y + 12);
        scene.addChild(name);

        const countLabel = new Text({
          text: 'x0',
          style: { fill: 0xc8cfdc, fontSize: 13 },
        });
        countLabel.position.set(x + 14, NODE_Y + 36);
        scene.addChild(countLabel);

        const progressBg = new Graphics()
          .roundRect(0, 0, NODE_W - 28, 8, 4)
          .fill(0x10131a);
        progressBg.alpha = 0.55;
        progressBg.position.set(x + 14, NODE_Y + NODE_H - 22);
        scene.addChild(progressBg);

        const outputColor = hexToNum(
          resourceById.get(def.outputResourceId)?.color ?? '',
          0x4fc97e,
        );
        const progressFill = new Graphics().rect(0, 0, 1, 8).fill(outputColor);
        progressFill.position.set(x + 14, NODE_Y + NODE_H - 22);
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
