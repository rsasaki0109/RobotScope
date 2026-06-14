import { useEffect, useRef } from "react";

import type {
  AutowareLanelet2View,
  AutowareMapView,
  AutowareOccupancyMapView,
  LaneletOsmLaneletView,
  LaneletOsmRegulatoryView,
} from "../types.js";
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

const LANELET_CANVAS_W = 320;
const LANELET_CANVAS_H = 140;
const LANELET_PAD = 10;

interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function collectLaneletBounds(
  lanelet: AutowareLanelet2View,
  ego?: EgoPose,
): WorldBounds | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let hasPoint = false;

  const include = (x: number, y: number) => {
    hasPoint = true;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  for (const polyline of [...(lanelet.boundaries ?? []), ...(lanelet.centerlines ?? [])]) {
    for (const [x, y] of polyline.points) {
      include(x, y);
    }
  }

  if (ego && (ego.frame_id === "map" || ego.frame_id === "odom")) {
    include(ego.position[0], ego.position[1]);
  }

  if (!hasPoint) {
    return null;
  }

  const spanX = Math.max(maxX - minX, 0.5);
  const spanY = Math.max(maxY - minY, 0.5);
  const marginX = spanX * 0.08;
  const marginY = spanY * 0.12;

  return {
    minX: minX - marginX,
    maxX: maxX + marginX,
    minY: minY - marginY,
    maxY: maxY + marginY,
  };
}

function worldToCanvas(x: number, y: number, bounds: WorldBounds): [number, number] {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const scale = Math.min(
    (LANELET_CANVAS_W - LANELET_PAD * 2) / spanX,
    (LANELET_CANVAS_H - LANELET_PAD * 2) / spanY,
  );
  const cx = LANELET_PAD + (x - bounds.minX) * scale;
  const cy = LANELET_CANVAS_H - LANELET_PAD - (y - bounds.minY) * scale;
  return [cx, cy];
}

function drawOsmWays(
  ctx: CanvasRenderingContext2D,
  ways: Array<{ points: Array<[number, number]> }>,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  width: number,
  height: number,
  padding: number,
): void {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);

  ctx.strokeStyle = "#6ec1ff";
  ctx.lineWidth = 1.2;
  for (const way of ways) {
    if (way.points.length < 2) {
      continue;
    }
    ctx.beginPath();
    for (let index = 0; index < way.points.length; index += 1) {
      const [x, y] = way.points[index]!;
      const px = padding + (x - bounds.minX) * scale;
      const py = height - padding - (y - bounds.minY) * scale;
      if (index === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }
}

function drawLaneletPreview(
  canvas: HTMLCanvasElement,
  lanelet: AutowareLanelet2View,
  ego?: EgoPose,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const bounds = collectLaneletBounds(lanelet, ego);
  if (!bounds) {
    return;
  }

  canvas.width = LANELET_CANVAS_W;
  canvas.height = LANELET_CANVAS_H;

  ctx.fillStyle = "#12151c";
  ctx.fillRect(0, 0, LANELET_CANVAS_W, LANELET_CANVAS_H);

  const drawPolyline = (
    points: Array<[number, number]>,
    color: string,
    closed: boolean,
  ) => {
    if (points.length === 0) {
      return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = closed ? 1.6 : 1.4;
    ctx.beginPath();
    const [startX, startY] = worldToCanvas(points[0]![0], points[0]![1], bounds);
    ctx.moveTo(startX, startY);
    for (let index = 1; index < points.length; index += 1) {
      const [x, y] = points[index]!;
      const [cx, cy] = worldToCanvas(x, y, bounds);
      ctx.lineTo(cx, cy);
    }
    if (closed) {
      ctx.closePath();
    }
    ctx.stroke();
  };

  for (const boundary of lanelet.boundaries ?? []) {
    drawPolyline(boundary.points, "#c8820a", true);
  }
  for (const centerline of lanelet.centerlines ?? []) {
    drawPolyline(centerline.points, "#f5a623", false);
  }

  if (ego && (ego.frame_id === "map" || ego.frame_id === "odom")) {
    const [cx, cy] = worldToCanvas(ego.position[0], ego.position[1], bounds);
    ctx.fillStyle = "#3dd68c";
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function formatRegulatorySubtypes(subtypes: Record<string, number> | undefined): string {
  if (!subtypes || Object.keys(subtypes).length === 0) {
    return "";
  }
  return Object.entries(subtypes)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([name, count]) => `${name}×${count}`)
    .join(", ");
}

function isClosedOsmPolyline(points: Array<[number, number]>): boolean {
  if (points.length < 4) {
    return false;
  }
  const [fx, fy] = points[0]!;
  const [lx, ly] = points[points.length - 1]!;
  return fx === lx && fy === ly;
}

function OsmLaneletSidecarPreview({
  lanelets,
  regulatoryElements,
  ego,
}: {
  lanelets: LaneletOsmLaneletView[];
  regulatoryElements?: LaneletOsmRegulatoryView[];
  ego?: EgoPose;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hasLanelets = lanelets.length > 0;
    const hasRegulatory = (regulatoryElements?.length ?? 0) > 0;
    if (!canvas || (!hasLanelets && !hasRegulatory)) {
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const includePoints = (points: Array<[number, number]>) => {
      for (const [x, y] of points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    };

    for (const lanelet of lanelets) {
      if (lanelet.left_bound) {
        includePoints(lanelet.left_bound.points);
      }
      if (lanelet.right_bound) {
        includePoints(lanelet.right_bound.points);
      }
      if (lanelet.centerline) {
        includePoints(lanelet.centerline.points);
      }
    }

    for (const element of regulatoryElements ?? []) {
      for (const member of element.members) {
        includePoints(member.points);
      }
    }

    if (ego) {
      minX = Math.min(minX, ego.position[0]);
      maxX = Math.max(maxX, ego.position[0]);
      minY = Math.min(minY, ego.position[1]);
      maxY = Math.max(maxY, ego.position[1]);
    }

    if (!Number.isFinite(minX)) {
      return;
    }

    canvas.width = LANELET_CANVAS_W;
    canvas.height = LANELET_CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.fillStyle = "#12151c";
    ctx.fillRect(0, 0, LANELET_CANVAS_W, LANELET_CANVAS_H);

    const bounds = { minX, maxX, minY, maxY };
    const drawPolyline = (
      points: Array<[number, number]>,
      color: string,
      closed: boolean,
    ) => {
      if (points.length < 2) {
        return;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = closed ? 1.6 : 1.4;
      ctx.beginPath();
      const [startX, startY] = worldToCanvas(points[0]![0], points[0]![1], bounds);
      ctx.moveTo(startX, startY);
      for (let index = 1; index < points.length; index += 1) {
        const [x, y] = points[index]!;
        const [cx, cy] = worldToCanvas(x, y, bounds);
        ctx.lineTo(cx, cy);
      }
      if (closed) {
        ctx.closePath();
      }
      ctx.stroke();
    };

    for (const lanelet of lanelets) {
      if (lanelet.left_bound) {
        drawPolyline(lanelet.left_bound.points, "#c8820a", true);
      }
      if (lanelet.right_bound) {
        drawPolyline(lanelet.right_bound.points, "#c8820a", true);
      }
      if (lanelet.centerline) {
        drawPolyline(lanelet.centerline.points, "#f5a623", false);
      }
    }

    for (const element of regulatoryElements ?? []) {
      for (const member of element.members) {
        const closed =
          member.role === "crosswalk_polygon" ||
          (member.role === "refers" && isClosedOsmPolyline(member.points));
        drawPolyline(member.points, member.role === "ref_line" ? "#b87aff" : "#9b59d6", closed);
      }
    }

    if (ego) {
      const [cx, cy] = worldToCanvas(ego.position[0], ego.position[1], bounds);
      ctx.fillStyle = "#3dd68c";
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [lanelets, regulatoryElements, ego]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.mapCanvas}
      aria-label="Lanelet2 OSM lanelet preview"
    />
  );
}

function OsmSidecarPreview({
  ways,
  ego,
}: {
  ways: Array<{ points: Array<[number, number]> }>;
  ego?: EgoPose;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || ways.length === 0) {
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const way of ways) {
      for (const [x, y] of way.points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    if (ego) {
      minX = Math.min(minX, ego.position[0]);
      maxX = Math.max(maxX, ego.position[0]);
      minY = Math.min(minY, ego.position[1]);
      maxY = Math.max(maxY, ego.position[1]);
    }

    canvas.width = LANELET_CANVAS_W;
    canvas.height = LANELET_CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.fillStyle = "#12151c";
    ctx.fillRect(0, 0, LANELET_CANVAS_W, LANELET_CANVAS_H);
    drawOsmWays(
      ctx,
      ways,
      { minX, maxX, minY, maxY },
      LANELET_CANVAS_W,
      LANELET_CANVAS_H,
      LANELET_PAD,
    );
  }, [ways, ego]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.mapCanvas}
      aria-label="Lanelet2 OSM sidecar preview"
    />
  );
}

function Lanelet2Preview({
  lanelet,
  ego,
}: {
  lanelet: AutowareLanelet2View;
  ego?: EgoPose;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasGeometry = Boolean(
    (lanelet.boundaries?.length ?? 0) > 0 || (lanelet.centerlines?.length ?? 0) > 0,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasGeometry) {
      return;
    }
    drawLaneletPreview(canvas, lanelet, ego);
  }, [lanelet, ego, hasGeometry]);

  if (!hasGeometry) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className={styles.mapCanvas}
      aria-label="Lanelet2 map preview"
    />
  );
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
  const osmSidecar = map?.osm_sidecar;
  const hasData = Boolean(lanelet || occupancy || osmSidecar);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Map / Lanelet2</h3>
        <span className={hasData ? styles.badgeOk : styles.badgeMissing}>
          {hasData ? "live" : "no data"}
        </span>
      </div>

      {!hasData ? (
        <p className={styles.empty}>
          Waiting for /map/vector_map, /map/map, or load an OSM sidecar…
        </p>
      ) : (
        <>
          {osmSidecar ? (
            <>
              <dl className={styles.grid}>
                <dt>OSM sidecar</dt>
                <dd>
                  {osmSidecar.lanelet_count > 0
                    ? `${osmSidecar.lanelet_count} lanelets · `
                    : ""}
                  {osmSidecar.way_count} ways · {osmSidecar.node_count} nodes
                </dd>
                {osmSidecar.regulatory_element_count > 0 ? (
                  <>
                    <dt>Regulatory</dt>
                    <dd>
                      {osmSidecar.regulatory_element_count} elements
                      {formatRegulatorySubtypes(osmSidecar.regulatory_subtypes)
                        ? ` · ${formatRegulatorySubtypes(osmSidecar.regulatory_subtypes)}`
                        : ""}
                    </dd>
                  </>
                ) : null}
              </dl>
            </>
          ) : null}

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
                    {lanelet.parse_format === "demo-rl2d"
                      ? " (RL2D demo)"
                      : lanelet.parse_format === "boost-lanelet2"
                        ? " (Boost bin)"
                        : ""}
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

          {lanelet && (lanelet.boundaries?.length || lanelet.centerlines?.length) ? (
            <Lanelet2Preview lanelet={lanelet} ego={ego} />
          ) : null}

          {osmSidecar?.lanelets?.length || osmSidecar?.regulatory_elements?.length ? (
            <OsmLaneletSidecarPreview
              lanelets={osmSidecar.lanelets ?? []}
              regulatoryElements={osmSidecar.regulatory_elements}
              ego={ego}
            />
          ) : osmSidecar?.ways.length ? (
            <OsmSidecarPreview ways={osmSidecar.ways} ego={ego} />
          ) : null}

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
