export interface ParsedOsmWay {
  id: string;
  points: Array<[number, number]>;
}

export interface ParsedOsmLanelet {
  id: string;
  left_bound?: ParsedOsmWay;
  right_bound?: ParsedOsmWay;
  centerline?: ParsedOsmWay;
}

export interface ParsedLaneletOsmMap {
  format: "autoware-osm";
  node_count: number;
  way_count: number;
  lanelet_count: number;
  ways: ParsedOsmWay[];
  lanelets: ParsedOsmLanelet[];
}

function readTagBlock(block: string, key: string): string | undefined {
  const pattern = new RegExp(
    `<tag\\s+k=['"]${key}['"]\\s+v=['"]([^'"]*)['"]\\s*/>`,
    "i",
  );
  const match = block.match(pattern);
  return match?.[1];
}

function parseNodes(xml: string): Map<string, [number, number]> {
  const nodes = new Map<string, [number, number]>();
  const nodePattern = /<node\b([^>]*)>([\s\S]*?)<\/node>/gi;

  for (const match of xml.matchAll(nodePattern)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const idMatch = attrs.match(/\bid=['"]([^'"]+)['"]/i);
    if (!idMatch) {
      continue;
    }

    const localX = readTagBlock(body, "local_x");
    const localY = readTagBlock(body, "local_y");
    if (localX != null && localY != null) {
      const x = Number(localX);
      const y = Number(localY);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        nodes.set(idMatch[1]!, [x, y]);
        continue;
      }
    }

    const latMatch = attrs.match(/\blat=['"]([^'"]+)['"]/i);
    const lonMatch = attrs.match(/\blon=['"]([^'"]+)['"]/i);
    if (latMatch && lonMatch) {
      const x = Number(lonMatch[1]);
      const y = Number(latMatch[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        nodes.set(idMatch[1]!, [x, y]);
      }
    }
  }

  return nodes;
}

function parseWays(xml: string, nodes: Map<string, [number, number]>): ParsedOsmWay[] {
  const ways: ParsedOsmWay[] = [];
  const wayPattern = /<way\b([^>]*)>([\s\S]*?)<\/way>/gi;

  for (const match of xml.matchAll(wayPattern)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const idMatch = attrs.match(/\bid=['"]([^'"]+)['"]/i);
    if (!idMatch) {
      continue;
    }

    const points: Array<[number, number]> = [];
    for (const ndMatch of body.matchAll(/<nd\b[^>]*\bref=['"]([^'"]+)['"][^>]*\/?>/gi)) {
      const node = nodes.get(ndMatch[1]!);
      if (node) {
        points.push(node);
      }
    }

    if (points.length >= 2) {
      ways.push({ id: idMatch[1]!, points });
    }
  }

  return ways;
}

function parseLaneletRelations(
  xml: string,
  waysById: Map<string, ParsedOsmWay>,
): ParsedOsmLanelet[] {
  const lanelets: ParsedOsmLanelet[] = [];
  const relationPattern = /<relation\b([^>]*)>([\s\S]*?)<\/relation>/gi;

  for (const match of xml.matchAll(relationPattern)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const idMatch = attrs.match(/\bid=['"]([^'"]+)['"]/i);
    if (!idMatch) {
      continue;
    }

    if (readTagBlock(body, "type") !== "lanelet") {
      continue;
    }

    let leftBound: ParsedOsmWay | undefined;
    let rightBound: ParsedOsmWay | undefined;
    let centerline: ParsedOsmWay | undefined;

    for (const memberMatch of body.matchAll(/<member\b([^>]*)\/?>/gi)) {
      const memberAttrs = memberMatch[1] ?? "";
      const memberType = memberAttrs.match(/\btype=['"]([^'"]+)['"]/i)?.[1];
      if (memberType !== "way") {
        continue;
      }

      const ref = memberAttrs.match(/\bref=['"]([^'"]+)['"]/i)?.[1];
      const role = memberAttrs.match(/\brole=['"]([^'"]+)['"]/i)?.[1]?.toLowerCase();
      if (!ref) {
        continue;
      }

      const way = waysById.get(ref);
      if (!way) {
        continue;
      }

      if (role === "left") {
        leftBound = way;
      } else if (role === "right") {
        rightBound = way;
      } else if (role === "centerline") {
        centerline = way;
      }
    }

    if (leftBound || rightBound || centerline) {
      lanelets.push({
        id: idMatch[1]!,
        left_bound: leftBound,
        right_bound: rightBound,
        centerline,
      });
    }
  }

  return lanelets;
}

/** Parse Autoware / Lanelet2 OSM sidecar maps (local_x/local_y nodes + ways + lanelet relations). */
export function parseLaneletOsm(xml: string): ParsedLaneletOsmMap | null {
  const trimmed = xml.trim();
  if (!trimmed.includes("<osm") || !trimmed.includes("<node")) {
    return null;
  }

  const nodes = parseNodes(trimmed);
  if (nodes.size === 0) {
    return null;
  }

  const ways = parseWays(trimmed, nodes);
  if (ways.length === 0) {
    return null;
  }

  const waysById = new Map(ways.map((way) => [way.id, way]));
  const lanelets = parseLaneletRelations(trimmed, waysById);

  return {
    format: "autoware-osm",
    node_count: nodes.size,
    way_count: ways.length,
    lanelet_count: lanelets.length,
    ways,
    lanelets,
  };
}

function wayToSceneTrajectory(
  way: ParsedOsmWay,
  entityPath: string,
  closed: boolean,
): import("../scene/scene-builder.js").SceneTrajectory {
  const points = new Float32Array(way.points.length * 3);
  for (let i = 0; i < way.points.length; i += 1) {
    const [x, y] = way.points[i]!;
    points[i * 3] = x;
    points[i * 3 + 1] = y;
    points[i * 3 + 2] = 0.02;
  }

  return {
    topic: "/world/map/lanelet2/osm",
    entity_path: entityPath,
    archetype: "Lanelet2" as const,
    points,
    point_count: way.points.length,
    closed,
  };
}

export function laneletOsmToSceneTrajectories(
  map: ParsedLaneletOsmMap,
): import("../scene/scene-builder.js").SceneTrajectory[] {
  if (map.lanelets.length === 0) {
    return map.ways.map((way, index) =>
      wayToSceneTrajectory(way, `/world/map/lanelet2/osm/${way.id || index}`, false),
    );
  }

  const trajectories: import("../scene/scene-builder.js").SceneTrajectory[] = [];
  const usedWayIds = new Set<string>();

  for (const lanelet of map.lanelets) {
    if (lanelet.left_bound) {
      usedWayIds.add(lanelet.left_bound.id);
      trajectories.push(
        wayToSceneTrajectory(
          lanelet.left_bound,
          `/world/map/lanelet2/osm/lanelet/${lanelet.id}/left`,
          true,
        ),
      );
    }
    if (lanelet.right_bound) {
      usedWayIds.add(lanelet.right_bound.id);
      trajectories.push(
        wayToSceneTrajectory(
          lanelet.right_bound,
          `/world/map/lanelet2/osm/lanelet/${lanelet.id}/right`,
          true,
        ),
      );
    }
    if (lanelet.centerline) {
      usedWayIds.add(lanelet.centerline.id);
      trajectories.push(
        wayToSceneTrajectory(
          lanelet.centerline,
          `/world/map/lanelet2/osm/lanelet/${lanelet.id}/centerline`,
          false,
        ),
      );
    }
  }

  for (const way of map.ways) {
    if (usedWayIds.has(way.id)) {
      continue;
    }
    trajectories.push(wayToSceneTrajectory(way, `/world/map/lanelet2/osm/way/${way.id}`, false));
  }

  return trajectories;
}
