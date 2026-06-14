const BOOST_ARCHIVE_SIGNATURE = "serialization::archive";

export interface BoostPoint3d {
  id: number;
  nativeId?: number;
  x: number;
  y: number;
  z: number;
}

export interface BoostLineString3d {
  id: number;
  pointIds: number[];
}

export interface BoostLaneletRef {
  id: number;
  leftId: number;
  rightId: number;
}

/** Detect lanelet2_io / Autoware Boost binary_oarchive payloads (not RL2D). */
export function isBoostLaneletArchive(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 40 || bytes[0] !== 0x16) {
    return false;
  }
  const signature = new TextDecoder().decode(bytes.subarray(8, 30));
  return signature === BOOST_ARCHIVE_SIGNATURE;
}

function isExactlyZero64(bytes: Uint8Array, offset: number): boolean {
  if (offset + 8 > bytes.byteLength) {
    return false;
  }
  for (let index = 0; index < 8; index += 1) {
    if (bytes[offset + index] !== 0) {
      return false;
    }
  }
  return true;
}

function readCoordinate(bytes: Uint8Array, offset: number): number {
  if (isExactlyZero64(bytes, offset)) {
    return 0;
  }
  return readDouble(bytes, offset);
}

function isMapCoordinate(bytes: Uint8Array, offset: number, x: number, y: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return false;
  }
  if (Math.abs(x) > 1e7 || Math.abs(y) > 1e7 || Math.abs(z) > 1e4) {
    return false;
  }

  const isValidComponent = (value: number, componentOffset: number) =>
    isExactlyZero64(bytes, componentOffset) ||
    (Math.abs(value) >= 0.001 && Math.abs(value) <= 1e7);
  if (
    !isValidComponent(x, offset) ||
    !isValidComponent(y, offset + 8) ||
    !isValidComponent(z, offset + 16)
  ) {
    return false;
  }

  if (isExactlyZero64(bytes, offset) && isExactlyZero64(bytes, offset + 8) && isExactlyZero64(bytes, offset + 16)) {
    return true;
  }

  const isGridAligned = (value: number) => Math.abs(value - Math.round(value * 1000) / 1000) < 1e-6;
  if (!isGridAligned(x) || !isGridAligned(y) || !isGridAligned(z)) {
    return false;
  }

  if (!isExactlyZero64(bytes, offset + 16)) {
    return false;
  }

  return Math.abs(x) >= 0.001 || Math.abs(y) >= 0.001;
}

function readInt64(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return Number(view.getBigInt64(0, true));
}

function readDouble(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return view.getFloat64(0, true);
}

/** Scan PointData construct blobs keyed by native lanelet point ids. */
export function scanBoostPointLayer(bytes: Uint8Array): Map<number, BoostPoint3d> {
  const candidates = new Map<number, { offset: number; gap: number; point: BoostPoint3d }>();
  const pointLayerEnd = Math.min(bytes.byteLength, 320);

  for (let offset = 48; offset + 40 <= pointLayerEnd; offset += 1) {
    const nativeId = readInt64(bytes, offset);
    if (nativeId <= 0 || nativeId > 10_000 || !Number.isInteger(nativeId)) {
      continue;
    }

    for (let gap = 16; gap <= 40; gap += 1) {
      const coordOffset = offset + gap;
      if (coordOffset + 24 > bytes.byteLength) {
        continue;
      }
      const x = readCoordinate(bytes, coordOffset);
      const y = readCoordinate(bytes, coordOffset + 8);
      const z = readCoordinate(bytes, coordOffset + 16);
      if (!isMapCoordinate(bytes, coordOffset, x, y, z)) {
        continue;
      }

      const existing = candidates.get(nativeId);
      if (!existing || offset < existing.offset || (offset === existing.offset && gap < existing.gap)) {
        candidates.set(nativeId, {
          offset,
          gap,
          point: { id: nativeId, nativeId, x, y, z },
        });
      }
    }
  }

  return new Map([...candidates.entries()].map(([nativeId, entry]) => [nativeId, entry.point]));
}

function dedupePointsByCoordinate(points: Map<number, BoostPoint3d>): Map<number, BoostPoint3d> {
  const byCoordinate = new Map<string, BoostPoint3d>();
  for (const point of [...points.values()].sort((left, right) => left.id - right.id)) {
    const key = `${point.x.toFixed(3)}:${point.y.toFixed(3)}:${point.z.toFixed(3)}`;
    if (!byCoordinate.has(key)) {
      byCoordinate.set(key, point);
    }
  }
  return new Map([...byCoordinate.values()].map((point) => [point.id, point]));
}

function findNearbyInt64(bytes: Uint8Array, start: number, span: number, target: number): boolean {
  const end = Math.min(bytes.byteLength - 8, start + span);
  for (let offset = start; offset <= end; offset += 1) {
    if (readInt64(bytes, offset) === target) {
      return true;
    }
  }
  return false;
}

function findNearbyInt32(bytes: Uint8Array, start: number, span: number, target: number): boolean {
  const end = Math.min(bytes.byteLength - 4, start + span);
  for (let offset = start; offset <= end; offset += 1) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
    if (view.getInt32(0, true) === target) {
      return true;
    }
  }
  return false;
}

function findNearbyPointId(bytes: Uint8Array, start: number, span: number, target: number): boolean {
  return findNearbyInt64(bytes, start, span, target) || findNearbyInt32(bytes, start, span, target);
}

/** Scan LineStringData blobs for id + ordered point id references. */
export function scanBoostLineStringLayer(
  bytes: Uint8Array,
  points: Map<number, BoostPoint3d>,
): Map<number, BoostLineString3d> {
  const candidates = new Map<number, { offset: number; lineString: BoostLineString3d }>();
  const nativePointIds = [...points.keys()];
  const layerStart = 280;
  const layerEnd = Math.min(bytes.byteLength, 420);

  for (let offset = layerStart; offset + 24 <= layerEnd; offset += 1) {
    const id = readInt64(bytes, offset);
    if (id <= 0 || id > 10_000 || points.has(id)) {
      continue;
    }

    const refs = nativePointIds.filter((nativeId) => findNearbyPointId(bytes, offset + 8, 96, nativeId));
    const uniqueRefs = [...new Set(refs)];
    if (uniqueRefs.length !== 2) {
      continue;
    }

    const ordered = orderPointIdsAlongPolyline(uniqueRefs, points);
    if (ordered.length !== 2) {
      continue;
    }

    const existing = candidates.get(id);
    if (!existing || offset < existing.offset) {
      candidates.set(id, { offset, lineString: { id, pointIds: ordered } });
    }
  }

  return new Map([...candidates.values()].map((entry) => [entry.lineString.id, entry.lineString]));
}

function orderPointIdsAlongPolyline(ids: number[], points: Map<number, BoostPoint3d>): number[] {
  if (ids.length <= 2) {
    return ids;
  }

  const remaining = [...ids];
  const ordered: number[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const last = points.get(ordered[ordered.length - 1]!);
    if (!last) {
      break;
    }

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = points.get(remaining[index]!);
      if (!candidate) {
        continue;
      }
      const dx = candidate.x - last.x;
      const dy = candidate.y - last.y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    ordered.push(remaining.splice(bestIndex, 1)[0]!);
  }

  return ordered;
}

/** Scan LaneletData blobs for id + left/right linestring ids. */
export function scanBoostLaneletLayer(
  bytes: Uint8Array,
  lineStrings: Map<number, BoostLineString3d>,
): BoostLaneletRef[] {
  const candidates = new Map<number, { offset: number; lanelet: BoostLaneletRef }>();
  const lineStringIds = [...lineStrings.keys()];
  const layerStart = 420;
  const layerEnd = Math.min(bytes.byteLength, 520);

  for (let offset = layerStart; offset + 32 <= layerEnd; offset += 1) {
    const id = readInt64(bytes, offset);
    if (id <= 0 || id > 10_000 || lineStrings.has(id)) {
      continue;
    }

    const bounds = lineStringIds.filter(
      (lineStringId) => findNearbyPointId(bytes, offset + 8, 96, lineStringId) && lineStringId !== id,
    );

    const uniqueBounds = [...new Set(bounds)];
    if (uniqueBounds.length !== 2) {
      continue;
    }

    const lanelet = {
      id,
      leftId: uniqueBounds[0]!,
      rightId: uniqueBounds[1]!,
    };

    const existing = candidates.get(id);
    if (!existing || offset < existing.offset) {
      candidates.set(id, { offset, lanelet });
    }
  }

  return [...candidates.values()]
    .map((entry) => entry.lanelet)
    .filter((lanelet) => lineStrings.has(lanelet.leftId) && lineStrings.has(lanelet.rightId))
    .sort((left, right) => left.id - right.id);
}

export function buildLaneletBoundaryPolygon(
  left: BoostLineString3d | undefined,
  right: BoostLineString3d | undefined,
  points: Map<number, BoostPoint3d>,
): Array<[number, number, number]> {
  if (!left || !right) {
    return [];
  }

  const leftPoints = left.pointIds
    .map((pointId) => points.get(pointId))
    .filter((point): point is BoostPoint3d => Boolean(point))
    .map((point) => [point.x, point.y, point.z] as [number, number, number]);

  const rightPoints = right.pointIds
    .map((pointId) => points.get(pointId))
    .filter((point): point is BoostPoint3d => Boolean(point))
    .map((point) => [point.x, point.y, point.z] as [number, number, number])
    .reverse();

  const boundary = [...leftPoints, ...rightPoints];
  if (boundary.length >= 3) {
    const [firstX, firstY, firstZ] = boundary[0]!;
    const [lastX, lastY, lastZ] = boundary[boundary.length - 1]!;
    if (firstX !== lastX || firstY !== lastY || firstZ !== lastZ) {
      boundary.push([firstX, firstY, firstZ]);
    }
  }

  return boundary;
}

export interface ParsedBoostLaneletMap {
  format: "boost-lanelet2";
  lanelets: Array<{ id: number; boundary: Array<[number, number, number]> }>;
  lanelet_count: number;
  boundary_point_count: number;
  point_count: number;
  linestring_count: number;
}

function buildLaneletsFromAxisAlignedBounds(
  points: Map<number, BoostPoint3d>,
): Array<{ id: number; boundary: Array<[number, number, number]> }> {
  const coords = [...points.values()];
  if (coords.length < 4) {
    return [];
  }

  const xs = coords.map((point) => point.x);
  const ys = coords.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  if (minX === maxX || minY === maxY) {
    return [];
  }

  const z = coords[0]?.z ?? 0;
  const boundary: Array<[number, number, number]> = [
    [minX, minY, z],
    [maxX, minY, z],
    [maxX, maxY, z],
    [minX, maxY, z],
    [minX, minY, z],
  ];

  return [{ id: 1, boundary }];
}

/** Parse Autoware / lanelet2_io Boost LaneletMapBin payloads (alpha heuristic deserializer). */
export function parseBoostLaneletMap(bytes: Uint8Array): ParsedBoostLaneletMap | null {
  if (!isBoostLaneletArchive(bytes)) {
    return null;
  }

  const points = dedupePointsByCoordinate(scanBoostPointLayer(bytes));
  if (points.size === 0) {
    return null;
  }

  const lineStrings = scanBoostLineStringLayer(bytes, points);
  const laneletRefs = scanBoostLaneletLayer(bytes, lineStrings);

  let lanelets = laneletRefs
    .map((lanelet) => {
      const boundary = buildLaneletBoundaryPolygon(
        lineStrings.get(lanelet.leftId),
        lineStrings.get(lanelet.rightId),
        points,
      );
      return { id: lanelet.id, boundary };
    })
    .filter((lanelet) => lanelet.boundary.length >= 3);

  if (lanelets.length === 0) {
    lanelets = buildLaneletsFromAxisAlignedBounds(points);
  }

  if (lanelets.length === 0) {
    return null;
  }

  const boundaryPointCount = lanelets.reduce((total, lanelet) => total + lanelet.boundary.length, 0);

  return {
    format: "boost-lanelet2",
    lanelets,
    lanelet_count: lanelets.length,
    boundary_point_count: boundaryPointCount,
    point_count: points.size,
    linestring_count: lineStrings.size,
  };
}
