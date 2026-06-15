import { useEffect, useRef } from "react";

import type { Nav2CostmapView } from "../types.js";
import styles from "./Nav2Panel.module.css";

interface EgoPose {
  frame_id: string;
  position: [number, number, number];
}

function drawCostmapPreview(
  canvas: HTMLCanvasElement,
  view: Nav2CostmapView,
  ego?: EgoPose,
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

  if (ego && (ego.frame_id === view.frame_id || ego.frame_id === "odom")) {
    const cellX = Math.round((ego.position[0] - view.origin_xy[0]) / view.resolution_m);
    const cellY = Math.round((ego.position[1] - view.origin_xy[1]) / view.resolution_m);
    if (cellX >= 0 && cellX < width && cellY >= 0 && cellY < height) {
      const drawY = height - 1 - cellY;
      ctx.fillStyle = "#3dd68c";
      ctx.beginPath();
      ctx.arc(cellX + 0.5, drawY + 0.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function CostmapPreview({ view, ego }: { view: Nav2CostmapView; ego?: EgoPose }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    drawCostmapPreview(canvas, view, ego);
  }, [view, ego]);

  return <canvas ref={canvasRef} className={styles.costmapCanvas} aria-label="Costmap preview" />;
}

export function CostmapPanel({ data, ego }: { data?: Nav2CostmapView; ego?: EgoPose }) {
  const total = data ? data.occupied_cells + data.free_cells + data.unknown_cells : 0;
  const occupiedPct = total > 0 && data ? (data.occupied_cells / total) * 100 : 0;

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Costmap</h3>
        <span className={data ? styles.badgeOk : styles.badgeMissing}>
          {data ? "live" : "no data"}
        </span>
      </div>
      {!data ? (
        <p className={styles.empty}>Waiting for /local_costmap/costmap…</p>
      ) : (
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
            <CostmapPreview view={data} ego={ego} />
          ) : null}
        </>
      )}
    </section>
  );
}
