export interface ParsedOsmWay {
  id: string;
  points: Array<[number, number]>;
}

export interface ParsedLaneletOsmMap {
  format: "autoware-osm";
  node_count: number;
  way_count: number;
  ways: ParsedOsmWay[];
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

/** Parse Autoware / Lanelet2 OSM sidecar maps (local_x/local_y nodes + ways). */
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

  return {
    format: "autoware-osm",
    node_count: nodes.size,
    way_count: ways.length,
    ways,
  };
}

export function laneletOsmToSceneTrajectories(
  map: ParsedLaneletOsmMap,
): import("../scene/scene-builder.js").SceneTrajectory[] {
  return map.ways.map((way, index) => {
    const points = new Float32Array(way.points.length * 3);
    for (let i = 0; i < way.points.length; i += 1) {
      const [x, y] = way.points[i]!;
      points[i * 3] = x;
      points[i * 3 + 1] = y;
      points[i * 3 + 2] = 0.02;
    }
    return {
      topic: "/world/map/lanelet2/osm",
      entity_path: `/world/map/lanelet2/osm/${way.id || index}`,
      archetype: "Lanelet2" as const,
      points,
      point_count: way.points.length,
      closed: false,
    };
  });
}
