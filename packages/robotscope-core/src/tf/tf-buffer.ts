import { composeTransforms, IDENTITY_TRANSFORM, type Transform3D } from "./transform-math.js";

export interface StoredTransform {
  parent_frame_id: string;
  child_frame_id: string;
  translation: [number, number, number];
  rotation: [number, number, number, number];
  time_ns: number;
  is_static: boolean;
}

export interface TfTreeNode {
  frame_id: string;
  parent_frame_id?: string;
  children: string[];
  is_static: boolean;
  last_update_ns?: number;
  age_ms?: number;
}

export interface TfHealthIssue {
  code:
    | "missing_edge"
    | "stale_transform"
    | "duplicate_static_authority"
    | "unconnected_frame";
  frame_id: string;
  message: string;
}

export interface TfTreeSnapshot {
  time_ns: number;
  fixed_frame: string;
  frames: TfTreeNode[];
  issues: TfHealthIssue[];
  transform_count: number;
}

interface EdgeHistory {
  parent_frame_id: string;
  child_frame_id: string;
  is_static: boolean;
  samples: StoredTransform[];
}

const STALE_MS = 5000;

export class TfBuffer {
  private readonly edges = new Map<string, EdgeHistory>();

  clear(): void {
    this.edges.clear();
  }

  get transformCount(): number {
    let count = 0;
    for (const edge of this.edges.values()) {
      count += edge.samples.length;
    }
    return count;
  }

  listTransforms(): StoredTransform[] {
    const transforms: StoredTransform[] = [];
    for (const edge of this.edges.values()) {
      transforms.push(...edge.samples);
    }
    return transforms;
  }

  importTransforms(other: TfBuffer): void {
    for (const transform of other.listTransforms()) {
      this.addTransform(transform);
    }
  }

  addTransform(transform: StoredTransform): void {
    const key = edgeKey(transform.parent_frame_id, transform.child_frame_id);
    let edge = this.edges.get(key);

    if (!edge) {
      edge = {
        parent_frame_id: transform.parent_frame_id,
        child_frame_id: transform.child_frame_id,
        is_static: transform.is_static,
        samples: [],
      };
      this.edges.set(key, edge);
    }

    if (transform.is_static) {
      edge.is_static = true;
      edge.samples = [transform];
      return;
    }

    edge.samples.push(transform);
    edge.samples.sort((a, b) => a.time_ns - b.time_ns);

    if (edge.samples.length > 4000) {
      edge.samples.splice(0, edge.samples.length - 4000);
    }
  }

  lookupTransform(
    parent: string,
    child: string,
    time_ns: number,
  ): StoredTransform | undefined {
    if (parent === child) {
      return {
        parent_frame_id: parent,
        child_frame_id: child,
        translation: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        time_ns,
        is_static: true,
      };
    }

    return this.lookupEdge(parent, child, time_ns);
  }

  getSnapshot(time_ns: number, fixedFrame = "map"): TfTreeSnapshot {
    const frameParents = new Map<
      string,
      { parent?: string; is_static: boolean; last_update_ns?: number }
    >();
    const children = new Map<string, Set<string>>();

    for (const edge of this.edges.values()) {
      const sample = this.lookupEdge(edge.parent_frame_id, edge.child_frame_id, time_ns);
      if (!sample) {
        continue;
      }

      frameParents.set(edge.child_frame_id, {
        parent: edge.parent_frame_id,
        is_static: edge.is_static,
        last_update_ns: sample.time_ns,
      });

      if (!frameParents.has(edge.parent_frame_id)) {
        frameParents.set(edge.parent_frame_id, {
          parent: undefined,
          is_static: false,
        });
      }

      const childSet = children.get(edge.parent_frame_id) ?? new Set<string>();
      childSet.add(edge.child_frame_id);
      children.set(edge.parent_frame_id, childSet);
    }

    const frames: TfTreeNode[] = [...frameParents.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((frame_id) => {
        const meta = frameParents.get(frame_id);
        const last_update_ns = meta?.last_update_ns;
        return {
          frame_id,
          parent_frame_id: meta?.parent,
          children: [...(children.get(frame_id) ?? [])].sort(),
          is_static: meta?.is_static ?? false,
          last_update_ns,
          age_ms:
            last_update_ns != null
              ? Math.max(0, (time_ns - last_update_ns) / 1e6)
              : undefined,
        };
      });

    return {
      time_ns,
      fixed_frame: fixedFrame,
      frames,
      issues: this.detectIssues(frames, fixedFrame),
      transform_count: this.transformCount,
    };
  }

  /** Returns transform from source frame into fixed frame coordinates. */
  lookupTransformToFixed(
    sourceFrame: string,
    fixedFrame: string,
    time_ns: number,
  ): Transform3D | undefined {
    if (sourceFrame === fixedFrame) {
      return {
        translation: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      };
    }

    const snapshot = this.getSnapshot(time_ns, fixedFrame);
    const parentByChild = new Map<string, string>();
    for (const frame of snapshot.frames) {
      if (frame.parent_frame_id) {
        parentByChild.set(frame.frame_id, frame.parent_frame_id);
      }
    }

    let current = sourceFrame;
    let sourceToCurrent = IDENTITY_TRANSFORM;
    const visited = new Set<string>();

    while (current !== fixedFrame) {
      if (visited.has(current)) {
        return undefined;
      }
      visited.add(current);

      const parent = parentByChild.get(current);
      if (!parent) {
        return undefined;
      }

      const edge = this.lookupEdge(parent, current, time_ns);
      if (!edge) {
        return undefined;
      }

      sourceToCurrent = composeTransforms(
        {
          translation: edge.translation,
          rotation: edge.rotation,
        },
        sourceToCurrent,
      );
      current = parent;
    }

    return sourceToCurrent;
  }

  /** Position of each TF frame origin expressed in fixed frame. */
  getFramePositionsInFixed(
    time_ns: number,
    fixedFrame: string,
  ): Map<string, Transform3D> {
    const snapshot = this.getSnapshot(time_ns, fixedFrame);
    const positions = new Map<string, Transform3D>();

    for (const frame of snapshot.frames) {
      const transform = this.lookupTransformToFixed(frame.frame_id, fixedFrame, time_ns);
      if (transform) {
        positions.set(frame.frame_id, transform);
      }
    }

    return positions;
  }

  private lookupEdge(
    parent: string,
    child: string,
    time_ns: number,
  ): StoredTransform | undefined {
    const edge = this.edges.get(edgeKey(parent, child));
    if (!edge || edge.samples.length === 0) {
      return undefined;
    }

    if (edge.is_static) {
      return edge.samples[0];
    }

    let best: StoredTransform | undefined;
    for (const sample of edge.samples) {
      if (sample.time_ns <= time_ns) {
        best = sample;
      } else {
        break;
      }
    }

    return best ?? edge.samples[0];
  }

  private detectIssues(frames: TfTreeNode[], fixedFrame: string): TfHealthIssue[] {
    const issues: TfHealthIssue[] = [];
    const frameSet = new Set(frames.map((f) => f.frame_id));

    if (fixedFrame && !frameSet.has(fixedFrame)) {
      issues.push({
        code: "missing_edge",
        frame_id: fixedFrame,
        message: `Fixed frame "${fixedFrame}" is not in TF tree at this time`,
      });
    }

    for (const frame of frames) {
      if (frame.is_static) {
        continue;
      }
      if (frame.age_ms != null && frame.age_ms > STALE_MS) {
        issues.push({
          code: "stale_transform",
          frame_id: frame.frame_id,
          message: `Transform age ${frame.age_ms.toFixed(0)} ms exceeds ${STALE_MS} ms`,
        });
      }
      if (frame.parent_frame_id && !frameSet.has(frame.parent_frame_id)) {
        issues.push({
          code: "unconnected_frame",
          frame_id: frame.frame_id,
          message: `Parent frame "${frame.parent_frame_id}" is missing`,
        });
      }
    }

    if (frames.length === 0) {
      issues.push({
        code: "missing_edge",
        frame_id: "tf",
        message: "No TF data indexed for this recording",
      });
    }

    return issues;
  }
}

function edgeKey(parent: string, child: string): string {
  return `${parent}->${child}`;
}
