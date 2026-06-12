import { useEffect, useRef } from "react";

import type { AutowareMapView, AutowareOccupancyMapView } from "../types.js";
import styles from "./AutowarePanel.module.css";

interface EgoPose {
  frame_id: string;
  position: [number, number, number];
}

function drawOccupancyPreview(
  canvas: HTMLCanvasElement,
  map: AutowareOccupancyMapView,
  ego?: EgoPose,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const width = map.width;
  const height = map.height;
  canvas.width = width;
  canvas.height = height;

  const image = ctx.createImageData(width, height);
  for (let index = 0; index < map.cells.length; index += 1) {
    const cell = map.cells[index] ?? -1;
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

  if (ego && (ego.frame_id === map.frame_id || ego.frame_id === "odom")) {
    const cellX = Math.round((ego.position[0] - map.origin_xy[0]) / map.resolution_m);
    const cellY = Math.round((ego.position[1] - map.origin_xy[1]) / map.resolution_m);
    if (cellX >= 0 && cellX < width && cellY >= 0 && cellY < height) {
      const drawY = height - 1 - cellY;
      ctx.fillStyle = "#3dd68c";
      ctx.beginPath();
      ctx.arc(cellX + 0.5, drawY + 0.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function OccupancyPreview({
  map,
  ego,
}: {
  map: AutowareOccupancyMapView;
  ego?: EgoPose;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    drawOccupancyPreview(canvas, map, ego);
  }, [map, ego]);

  return <canvas ref={canvasRef} className={styles.mapCanvas} aria-label="Occupancy map preview" />;
}

export function MapPanel({
  map,
  ego,
}: {
  map?: AutowareMapView;
  ego?: EgoPose;
}) {
  const lanelet = map?.lanelet2;
  const occupancy = map?.occupancy;
  const hasData = Boolean(lanelet || occupancy);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Map / Lanelet2</h3>
        <span className={hasData ? styles.badgeOk : styles.badgeMissing}>
          {hasData ? "live" : "no data"}
        </span>
      </div>

      {!hasData ? (
        <p className={styles.empty}>Waiting for /map/vector_map or /map/map…</p>
      ) : (
        <>
          {lanelet ? (
            <dl className={styles.grid}>
              <dt>Lanelet2</dt>
              <dd className={styles.mono}>{lanelet.topic}</dd>
              <dt>Payload</dt>
              <dd>{(lanelet.byte_size / 1024).toFixed(1)} KiB</dd>
              {lanelet.format_version != null ? (
                <>
                  <dt>Format</dt>
                  <dd>{String(lanelet.format_version)}</dd>
                </>
              ) : null}
              {lanelet.lanelet_count != null && lanelet.lanelet_count > 0 ? (
                <>
                  <dt>Lanelets</dt>
                  <dd>
                    {lanelet.lanelet_count} parsed
                    {lanelet.parse_format === "demo-rl2d" ? " (RL2D demo)" : ""}
                  </dd>
                </>
              ) : null}
              {lanelet.boundary_point_count != null && lanelet.boundary_point_count > 0 ? (
                <>
                  <dt>Boundary pts</dt>
                  <dd>{lanelet.boundary_point_count}</dd>
                </>
              ) : null}
            </dl>
          ) : (
            <p className={styles.empty}>Lanelet2 vector map not in recording</p>
          )}

          {occupancy ? (
            <>
              <dl className={styles.grid}>
                <dt>Grid</dt>
                <dd className={styles.mono}>{occupancy.topic}</dd>
                <dt>Size</dt>
                <dd>
                  {occupancy.width} × {occupancy.height} @ {occupancy.resolution_m.toFixed(3)} m
                </dd>
                <dt>Cells</dt>
                <dd>
                  occ {occupancy.occupied_cells} · free {occupancy.free_cells} · unk{" "}
                  {occupancy.unknown_cells}
                </dd>
              </dl>
              <OccupancyPreview map={occupancy} ego={ego} />
            </>
          ) : (
            <p className={styles.empty}>Occupancy / pointcloud map not in recording</p>
          )}
        </>
      )}
    </section>
  );
}
