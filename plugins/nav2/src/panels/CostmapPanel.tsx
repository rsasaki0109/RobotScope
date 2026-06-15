import { useEffect, useRef } from "react";

import type { Nav2CostmapView, Nav2GoalView, Nav2PlanView } from "../types.js";
import styles from "./Nav2Panel.module.css";
import { PanelShell } from "./PanelShell.js";

interface EgoPose {
  frame_id: string;
  position: [number, number, number];
}

interface CostmapOverlays {
  ego?: EgoPose;
  globalPlan?: Nav2PlanView;
  localPlan?: Nav2PlanView;
  goal?: Nav2GoalView;
}

interface CellProjection {
  cellX: number;
  cellY: number;
  px: number;
  py: number;
  inBounds: boolean;
}

function worldToCell(view: Nav2CostmapView, wx: number, wy: number): CellProjection | undefined {
  if (view.resolution_m <= 0) {
    return undefined;
  }

  const cellX = (wx - view.origin_xy[0]) / view.resolution_m;
  const cellY = (wy - view.origin_xy[1]) / view.resolution_m;
  const drawY = view.height - 1 - cellY;

  return {
    cellX,
    cellY,
    px: cellX + 0.5,
    py: drawY + 0.5,
    inBounds: cellX >= 0 && cellX < view.width && cellY >= 0 && cellY < view.height,
  };
}

function drawPlan(
  ctx: CanvasRenderingContext2D,
  view: Nav2CostmapView,
  plan: Nav2PlanView | undefined,
  color: string,
): void {
  if (!plan || plan.points.length === 0) {
    return;
  }
  if (plan.frame_id !== view.frame_id && plan.frame_id !== "odom") {
    return;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  let drawing = false;
  for (const [wx, wy] of plan.points) {
    const projected = worldToCell(view, wx, wy);
    if (!projected?.inBounds) {
      if (drawing) {
        ctx.stroke();
        ctx.beginPath();
        drawing = false;
      }
      continue;
    }

    if (drawing) {
      ctx.lineTo(projected.px, projected.py);
    } else {
      ctx.moveTo(projected.px, projected.py);
      drawing = true;
    }
  }

  if (drawing) {
    ctx.stroke();
  }
}

function drawGoal(
  ctx: CanvasRenderingContext2D,
  view: Nav2CostmapView,
  goal: Nav2GoalView | undefined,
): void {
  if (!goal || goal.frame_id !== view.frame_id) {
    return;
  }

  const projected = worldToCell(view, goal.position[0], goal.position[1]);
  if (!projected?.inBounds) {
    return;
  }

  ctx.fillStyle = "#e879f9";
  ctx.strokeStyle = "#e879f9";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(projected.px, projected.py, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(projected.px - 2.6, projected.py);
  ctx.lineTo(projected.px + 2.6, projected.py);
  ctx.moveTo(projected.px, projected.py - 2.6);
  ctx.lineTo(projected.px, projected.py + 2.6);
  ctx.stroke();
}

function drawEgo(
  ctx: CanvasRenderingContext2D,
  view: Nav2CostmapView,
  ego: EgoPose | undefined,
): void {
  if (!ego || (ego.frame_id !== view.frame_id && ego.frame_id !== "odom")) {
    return;
  }

  const projected = worldToCell(view, ego.position[0], ego.position[1]);
  if (!projected?.inBounds) {
    return;
  }

  ctx.fillStyle = "#3dd68c";
  ctx.beginPath();
  ctx.arc(projected.px, projected.py, 1.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawCostmapPreview(
  canvas: HTMLCanvasElement,
  view: Nav2CostmapView,
  overlays: CostmapOverlays = {},
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const width = view.width;
  const height = view.height;
  canvas.width = width;
  canvas.height = height;

  const image = ctx.createImageData(width, height);
  for (let index = 0; index < view.cells.length; index += 1) {
    const cell = view.cells[index] ?? -1;
    const offset = index * 4;
    if (cell < 0) {
      image.data[offset] = 40;
      image.data[offset + 1] = 44;
      image.data[offset + 2] = 52;
      image.data[offset + 3] = 255;
    } else if (cell > 50) {
      image.data[offset] = 214;
      image.data[offset + 1] = 61;
      image.data[offset + 2] = 92;
      image.data[offset + 3] = 255;
    } else {
      image.data[offset] = 22;
      image.data[offset + 1] = 27;
      image.data[offset + 2] = 34;
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  drawPlan(ctx, view, overlays.globalPlan, "#38bdf8");
  drawPlan(ctx, view, overlays.localPlan, "#facc15");
  drawGoal(ctx, view, overlays.goal);
  drawEgo(ctx, view, overlays.ego);
}

function CostmapPreview({
  view,
  ego,
  globalPlan,
  localPlan,
  goal,
}: {
  view: Nav2CostmapView;
  ego?: EgoPose;
  globalPlan?: Nav2PlanView;
  localPlan?: Nav2PlanView;
  goal?: Nav2GoalView;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    drawCostmapPreview(canvas, view, { ego, globalPlan, localPlan, goal });
  }, [view, ego, globalPlan, localPlan, goal]);

  return (
    <>
      <canvas ref={canvasRef} className={styles.costmapCanvas} aria-label="Costmap preview" />
      <div className={styles.costmapLegend} aria-label="Costmap overlay legend">
        <span>
          <span className={styles.legendGlobal} /> global plan
        </span>
        <span>
          <span className={styles.legendLocal} /> local plan
        </span>
        <span>
          <span className={styles.legendGoal} /> goal
        </span>
        <span>
          <span className={styles.legendEgo} /> ego
        </span>
      </div>
    </>
  );
}

export function CostmapPanel({
  data,
  ego,
  globalPlan,
  localPlan,
  goal,
}: {
  data?: Nav2CostmapView;
  ego?: EgoPose;
  globalPlan?: Nav2PlanView;
  localPlan?: Nav2PlanView;
  goal?: Nav2GoalView;
}) {
  const total = data ? data.occupied_cells + data.free_cells + data.unknown_cells : 0;
  const occupiedPct = total > 0 && data ? (data.occupied_cells / total) * 100 : 0;

  return (
    <PanelShell
      title="Costmap"
      tone={data ? "ok" : "missing"}
      label={data ? "live" : "no data"}
      empty={!data}
      emptyMessage="Waiting for /local_costmap/costmap…"
    >
      {data ? (
        <>
          <dl className={styles.grid}>
            <dt>Topic</dt>
            <dd className={styles.mono}>{data.topic}</dd>
            <dt>Size</dt>
            <dd>
              {data.width} × {data.height} @ {data.resolution_m.toFixed(3)} m
            </dd>
            <dt>Cells</dt>
            <dd>
              occ {data.occupied_cells} · free {data.free_cells} · unk {data.unknown_cells}
            </dd>
          </dl>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: `${occupiedPct}%` }} />
          </div>
          {data.cells.length > 0 && data.width > 0 && data.height > 0 ? (
            <CostmapPreview
              view={data}
              ego={ego}
              globalPlan={globalPlan}
              localPlan={localPlan}
              goal={goal}
            />
          ) : null}
        </>
      ) : null}
    </PanelShell>
  );
}
