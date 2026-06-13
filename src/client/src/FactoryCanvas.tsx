import { useEffect, useRef } from 'react';
import { Application, Container, FederatedPointerEvent, Graphics, Text } from 'pixi.js';
import { chainComponents, chainLabel, optimalRatios } from './chains';
import type { BuildingDefinition, GameContent, GameState } from './types';

const NODE_W = 160;
const NODE_H = 96;
const COL_X0 = 40;
const COL_GAP = 230; // NODE_W + edge room
const ROW_TOP = 16;
const ROW_LABEL_H = 26;
const ROW_H = ROW_LABEL_H + NODE_H + 78; // label + node + edge/inventory room
const DOTS_PER_EDGE = 4;
const HEAP_ROWS = [5, 4, 3, 2, 1]; // pyramid, bottom row first (15 blocks max)
const HEAP_MAX = 15;

const COLOR_STARVED = 0xe5a44a;
const COLOR_BOTTLENECK = 0xe0533f;
const COLOR_LABEL = 0x9aa4b8;

const SHAPE_RADIUS: Record<string, number> = {
  box: 3,
  rounded: 14,
  pill: NODE_H / 2,
};

function hexToNum(hex: string, fallback = 0x1d2433): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() ?? '');
  return m ? parseInt(m[1], 16) : fallback;
}

type NodeStatus = 'ok' | 'starved' | 'bottleneck';

interface NodeView {
  countLabel: Text;
  progressFill: Graphics;
  highlight: Graphics;
  statusText: Text;
  status: NodeStatus;
}

interface EdgeView {
  resourceId: string;
  dots: Graphics[];
  /** Polyline the dots travel along. */
  points: { x: number; y: number }[];
  segmentLengths: number[];
  totalLength: number;
  inventoryLabel: Text;
  heap: Graphics[];
  lastUnits: number;
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

/**
 * Potential per-second supply and demand for every resource, from owned
 * station counts and recipes. Used to find which station type is the real
 * bottleneck (build more of it and the chain flows again).
 */
function flowRates(
  buildings: BuildingDefinition[],
  ownedCounts: Map<string, number>,
): { supply: Map<string, number>; demand: Map<string, number> } {
  const supply = new Map<string, number>();
  const demand = new Map<string, number>();
  for (const def of buildings) {
    const count = ownedCounts.get(def.id) ?? 0;
    if (count === 0 || def.productionTimeSeconds <= 0) continue;
    const perSecond = count / def.productionTimeSeconds;
    supply.set(
      def.outputResourceId,
      (supply.get(def.outputResourceId) ?? 0) + perSecond * def.outputAmount,
    );
    if (def.inputResourceId) {
      demand.set(
        def.inputResourceId,
        (demand.get(def.inputResourceId) ?? 0) + perSecond * def.inputAmount,
      );
    }
  }
  return { supply, demand };
}

interface Props {
  content: GameContent;
  /** Latest polled state; read inside the render ticker without re-rendering React. */
  stateRef: React.RefObject<GameState | null>;
  /** When set, station nodes become clickable (left or right) and report viewport coords. */
  onStationMenu?: (definitionId: string, clientX: number, clientY: number) => void;
  /** Show each station's balanced-ratio target (⚖ N) for max throughput. */
  showRatios?: boolean;
  /** Make the view a draggable/pinch-zoomable camera (for the live game on phones). */
  pannable?: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/**
 * Abstract node-graph view of the factory: one row per production chain, one
 * node per station styled by its admin-configured color/shape/icon, dots in
 * each product's color flowing along the edges, progress bars per node.
 * Starved stations pulse amber; the station type whose capacity is the actual
 * bottleneck pulses red; edge backlogs pile up as block heaps.
 */
export function FactoryCanvas({ content, stateRef, onStationMenu, showRatios, pannable }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef(onStationMenu);
  menuRef.current = onStationMenu;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const components = chainComponents(content.buildings);
    const ratios = showRatios ? optimalRatios(content.buildings) : null;
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
    const sceneW = Math.max(960, COL_X0 * 2 + (maxCols - 1) * COL_GAP + NODE_W);
    const sceneH = Math.max(340, ROW_TOP + rowCount * ROW_H);

    // Pannable (live game): the canvas is a viewport into a larger scene the
    // player drags/pinches around. Otherwise (admin preview) it's the full
    // scene scaled to fit by CSS, as before.
    const viewW = pannable ? Math.max(320, Math.floor(host.clientWidth || sceneW)) : sceneW;
    const viewH = pannable
      ? Math.max(360, Math.min(sceneH, Math.round((window.innerHeight || 720) * 0.68)))
      : sceneH;

    let cancelled = false;
    const app = new Application();
    // Set true by a drag/pinch so the gesture isn't also read as a tap-to-build.
    let didPan = false;
    let detachCamera = () => {};

    const setup = async () => {
      await app.init({
        width: viewW,
        height: viewH,
        backgroundColor: 0x10131a,
        antialias: true,
        resolution: pannable ? window.devicePixelRatio || 1 : 1,
        autoDensity: pannable,
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
              style: { fill: COLOR_LABEL, fontSize: 12 },
            });
            inventoryLabel.anchor.set(0.5, 0);
            inventoryLabel.position.set(labelPoint.x, labelPoint.y + 8);
            scene.addChild(inventoryLabel);

            const dotColor = hexToNum(resource?.color ?? '', 0xf0b35c);

            // Backlog heap: a pyramid of blocks just above the edge midpoint.
            const heap: Graphics[] = [];
            HEAP_ROWS.forEach((n, r) => {
              for (let k = 0; k < n; k++) {
                const sq = new Graphics().rect(0, 0, 6, 6).fill(dotColor);
                sq.position.set(
                  labelPoint.x + (k - (n - 1) / 2) * 7 - 3,
                  labelPoint.y - 14 - r * 7,
                );
                sq.visible = false;
                edgeLayer.addChild(sq);
                heap.push(sq);
              }
            });

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
              heap,
              lastUnits: -1,
            });
          }
        }

        const { x, y } = positions[i];
        const radius = SHAPE_RADIUS[def.shape] ?? SHAPE_RADIUS.box;

        // Alert border, behind the node box; pulsed by the ticker.
        const highlight = new Graphics()
          .roundRect(-3, -3, NODE_W + 6, NODE_H + 6, radius + 4)
          .stroke({ width: 3, color: COLOR_STARVED });
        highlight.position.set(x, y);
        highlight.visible = false;
        scene.addChild(highlight);

        const box = new Graphics()
          .roundRect(0, 0, NODE_W, NODE_H, radius)
          .fill(hexToNum(def.color))
          .stroke({ width: 2, color: 0x3e4a61 });
        box.position.set(x, y);
        scene.addChild(box);

        if (menuRef.current) {
          box.eventMode = 'static';
          box.cursor = 'pointer';
          const openMenu = (e: FederatedPointerEvent) => {
            if (didPan) return; // the gesture was a camera drag/pinch, not a tap
            menuRef.current?.(def.id, e.clientX, e.clientY);
          };
          // pointertap covers mouse click and touch tap; rightclick keeps the
          // desktop right-click affordance.
          box.on('pointertap', openMenu);
          box.on('rightclick', openMenu);
        }

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

        // Balanced-ratio target: how many of this station to keep the chain fed.
        const ideal = ratios?.get(def.id);
        if (ideal !== undefined) {
          const ratioLabel = new Text({
            text: `⚖ ${ideal}`,
            style: { fill: COLOR_LABEL, fontSize: 13, fontWeight: '600' },
          });
          ratioLabel.anchor.set(1, 0);
          ratioLabel.position.set(x + NODE_W - 12, y + 36);
          scene.addChild(ratioLabel);
        }

        const statusText = new Text({
          text: '',
          style: { fill: COLOR_STARVED, fontSize: 12, fontWeight: '600' },
        });
        statusText.position.set(x + 14, y + 55);
        scene.addChild(statusText);

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

        nodes.set(def.id, { countLabel, progressFill, highlight, statusText, status: 'ok' });
      });

      const setStatus = (view: NodeView, status: NodeStatus, inputIcon: string) => {
        if (view.status === status) return;
        view.status = status;
        if (status === 'starved') {
          view.statusText.text = `⚠ starved — no ${inputIcon}`;
          view.statusText.style.fill = COLOR_STARVED;
          view.highlight.tint = 0xffffff; // drawn amber
          view.highlight.visible = true;
        } else if (status === 'bottleneck') {
          view.statusText.text = '▲ add capacity';
          view.statusText.style.fill = COLOR_BOTTLENECK;
          // Highlight was drawn amber; tint shifts it red.
          view.highlight.tint = 0xff7766;
          view.highlight.visible = true;
        } else {
          view.statusText.text = '';
          view.highlight.visible = false;
        }
      };

      // --- Camera: drag to pan, pinch / wheel to zoom (live game only) ---
      if (pannable) {
        const camera = { x: 0, y: 0, scale: 1 };
        let minScale = 1;
        const maxScale = 2.5;

        const apply = () => {
          camera.scale = clamp(camera.scale, minScale, maxScale);
          scene.scale.set(camera.scale);
          scene.position.set(camera.x, camera.y);
        };

        // Contain the whole scene and center it (don't upscale past 1:1).
        const fit = () => {
          const fitScale = Math.min(app.screen.width / sceneW, app.screen.height / sceneH, 1);
          minScale = fitScale * 0.6; // allow zooming out a little past the fit
          camera.scale = fitScale;
          camera.x = (app.screen.width - sceneW * fitScale) / 2;
          camera.y = Math.max(0, (app.screen.height - sceneH * fitScale) / 2);
          apply();
        };
        fit();

        // Screen → canvas-logical coords, robust to any CSS scaling of the canvas.
        const toLocal = (clientX: number, clientY: number) => {
          const r = app.canvas.getBoundingClientRect();
          return {
            x: ((clientX - r.left) / r.width) * app.screen.width,
            y: ((clientY - r.top) / r.height) * app.screen.height,
          };
        };
        const zoomAround = (pt: { x: number; y: number }, nextScale: number) => {
          const s = clamp(nextScale, minScale, maxScale);
          const worldX = (pt.x - camera.x) / camera.scale;
          const worldY = (pt.y - camera.y) / camera.scale;
          camera.scale = s;
          camera.x = pt.x - worldX * s;
          camera.y = pt.y - worldY * s;
          apply();
        };

        const pointers = new Map<number, { x: number; y: number }>();
        let moveAccum = 0;
        let pinchDist = 0;
        let pinchScale = 1;

        const onDown = (e: PointerEvent) => {
          app.canvas.setPointerCapture?.(e.pointerId);
          pointers.set(e.pointerId, toLocal(e.clientX, e.clientY));
          if (pointers.size === 1) {
            moveAccum = 0;
            didPan = false;
          } else if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
            pinchScale = camera.scale;
          }
        };
        const onMove = (e: PointerEvent) => {
          if (!pointers.has(e.pointerId)) return;
          const prev = pointers.get(e.pointerId)!;
          const cur = toLocal(e.clientX, e.clientY);
          pointers.set(e.pointerId, cur);

          if (pointers.size >= 2) {
            const [a, b] = [...pointers.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinchDist > 0) {
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              zoomAround(mid, pinchScale * (dist / pinchDist));
            }
            didPan = true;
          } else {
            const dx = cur.x - prev.x;
            const dy = cur.y - prev.y;
            camera.x += dx;
            camera.y += dy;
            moveAccum += Math.hypot(dx, dy);
            if (moveAccum > 8) didPan = true; // past this, it's a pan not a tap
            apply();
          }
        };
        const onUp = (e: PointerEvent) => {
          pointers.delete(e.pointerId);
          if (pointers.size < 2) pinchDist = 0;
        };
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          zoomAround(toLocal(e.clientX, e.clientY), camera.scale * Math.exp(-e.deltaY * 0.0015));
        };
        const onResize = () => {
          const w = Math.max(320, Math.floor(host.clientWidth || sceneW));
          if (Math.abs(w - app.screen.width) < 2) return;
          app.renderer.resize(w, viewH);
          fit();
        };

        const canvas = app.canvas;
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointercancel', onUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        const ro = new ResizeObserver(onResize);
        ro.observe(host);

        detachCamera = () => {
          canvas.removeEventListener('pointerdown', onDown);
          canvas.removeEventListener('pointermove', onMove);
          canvas.removeEventListener('pointerup', onUp);
          canvas.removeEventListener('pointercancel', onUp);
          canvas.removeEventListener('wheel', onWheel);
          ro.disconnect();
        };
      }

      let phase = 0;
      app.ticker.add((ticker) => {
        const state = stateRef.current;
        if (!state) return;

        phase = (phase + ticker.deltaMS / 2500) % 1;
        const pulse = 0.45 + 0.55 * Math.abs(Math.sin(phase * Math.PI * 4));

        const ownedCounts = new Map<string, number>();
        for (const b of state.buildings) {
          ownedCounts.set(b.definitionId, (ownedCounts.get(b.definitionId) ?? 0) + 1);
        }
        const { supply, demand } = flowRates(content.buildings, ownedCounts);

        for (const def of content.buildings) {
          const view = nodes.get(def.id);
          if (!view) continue;
          const owned = state.buildings.filter((b) => b.definitionId === def.id);
          view.countLabel.text = `x${owned.length}`;
          const avgProgress = owned.length
            ? owned.reduce((sum, b) => sum + b.progress, 0) / owned.length
            : 0;
          view.progressFill.scale.x = avgProgress * (NODE_W - 28);

          // Starved: owns instances that are idle waiting for input.
          const starved =
            def.inputResourceId !== null && owned.some((b) => !b.cycleActive);

          // Bottleneck: building more of THIS station fixes a flow problem —
          // either its output is in shortfall, or its input is piling up.
          // A starved station is never the fix (its own input is short).
          const outShort =
            (demand.get(def.outputResourceId) ?? 0) >
            (supply.get(def.outputResourceId) ?? 0) * 1.05 + 1e-6;
          const inSurplus =
            def.inputResourceId !== null &&
            (supply.get(def.inputResourceId) ?? 0) >
            ((demand.get(def.inputResourceId) ?? 0)) * 1.05 + 1e-6;
          const bottleneck = !starved && (outShort || inSurplus);

          const inputIcon = def.inputResourceId
            ? resourceById.get(def.inputResourceId)?.icon ?? def.inputResourceId
            : '';
          setStatus(view, starved ? 'starved' : bottleneck ? 'bottleneck' : 'ok', inputIcon);
          if (view.highlight.visible) {
            view.highlight.alpha = pulse;
          }
        }

        for (const edge of edges) {
          const units = state.inventory[edge.resourceId] ?? 0;
          if (units !== edge.lastUnits) {
            edge.lastUnits = units;
            const resource = resourceById.get(edge.resourceId);
            edge.inventoryLabel.text =
              `${resource?.icon ?? ''} ${units} ${resource?.name ?? edge.resourceId}`;
            edge.inventoryLabel.style.fill =
              units > 40 ? COLOR_BOTTLENECK : units > 15 ? COLOR_STARVED : COLOR_LABEL;
            const shown = Math.min(units, HEAP_MAX);
            edge.heap.forEach((sq, idx) => {
              sq.visible = idx < shown;
            });
          }
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
      detachCamera();
      if (app.renderer) {
        app.destroy(true, { children: true });
      }
    };
  }, [content, stateRef, showRatios, pannable]);

  return (
    <div
      className={pannable ? 'factory-canvas pannable' : 'factory-canvas'}
      ref={hostRef}
      onContextMenu={onStationMenu ? (e) => e.preventDefault() : undefined}
    />
  );
}
