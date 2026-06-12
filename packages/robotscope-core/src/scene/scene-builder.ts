import type { MappedTopic } from "../mapping/entity-mapper.js";
import type { ArchetypeName } from "../rdm.js";
import type { RawMessage } from "../query.js";
import { parseLaneletMapBin } from "../ros2/lanelet-map-bin.js";
import { parseOccupancyGrid, transformOccupancyGridToFixed } from "../ros2/occupancy-grid.js";
import { parsePointCloud2, type DecodedPointCloud2 } from "../ros2/pointcloud2.js";
import { extractPose, transformPoseToFixed } from "../ros2/pose.js";
import { extractTrajectory, transformTrajectoryToFixed } from "../ros2/trajectory.js";
import type { TfBuffer } from "../tf/tf-buffer.js";

export interface SceneTfFrame {
  frame_id: string;
  parent_frame_id?: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  is_static: boolean;
}

export interface ScenePose {
  topic: string;
  entity_path: string;
  label: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
}

export interface ScenePointCloud {
  topic: string;
  entity_path: string;
  points: Float32Array;
  point_count: number;
}

export interface SceneTrajectory {
  topic: string;
  entity_path: string;
  archetype: "Trajectory" | "Lanelet2";
  points: Float32Array;
  point_count: number;
  closed?: boolean;
}

export interface SceneOccupancyGrid {
  topic: string;
  entity_path: string;
  width: number;
  height: number;
  resolution: number;
  origin: {
    position: [number, number, number];
    rotation: [number, number, number, number];
  };
  rgba: Uint8Array;
}

export interface SceneSnapshot {
  time_ns: number;
  fixed_frame: string;
  tf_frames: SceneTfFrame[];
  poses: ScenePose[];
  point_clouds: ScenePointCloud[];
  trajectories: SceneTrajectory[];
  occupancy_grids: SceneOccupancyGrid[];
  warnings: string[];
}

const SCENE_ARCHETYPES = new Set<ArchetypeName>([
  "PointCloud",
  "Pose",
  "Trajectory",
  "OccupancyGrid",
  "Lanelet2",
]);

export interface SceneBuildOptions {
  fixed_frame?: string;
  topics?: string[];
  include_tf_frames?: boolean;
}

export async function buildSceneSnapshot(
  tfBuffer: TfBuffer,
  mappedTopics: MappedTopic[],
  time_ns: number,
  getRawMessage: (topic: string, time_ns: number) => Promise<RawMessage | null>,
  options: SceneBuildOptions = {},
): Promise<SceneSnapshot> {
  const fixed_frame = options.fixed_frame ?? "map";
  const include_tf_frames = options.include_tf_frames ?? true;
  const warnings: string[] = [];

  const tf_frames: SceneTfFrame[] = [];
  if (include_tf_frames) {
    const tfSnapshot = tfBuffer.getSnapshot(time_ns, fixed_frame);
    const positions = tfBuffer.getFramePositionsInFixed(time_ns, fixed_frame);
    for (const frame of tfSnapshot.frames) {
      const transform = positions.get(frame.frame_id);
      if (!transform) {
        continue;
      }
      tf_frames.push({
        frame_id: frame.frame_id,
        parent_frame_id: frame.parent_frame_id,
        position: transform.translation,
        rotation: transform.rotation,
        is_static: frame.is_static,
      });
    }
  }

  const topicFilter = options.topics ? new Set(options.topics) : undefined;
  const sceneTopics = mappedTopics.filter((topic) => {
    if (!SCENE_ARCHETYPES.has(topic.archetype)) {
      return false;
    }
    if (topicFilter && !topicFilter.has(topic.topic)) {
      return false;
    }
    return true;
  });

  const poses: ScenePose[] = [];
  const point_clouds: ScenePointCloud[] = [];
  const trajectories: SceneTrajectory[] = [];
  const occupancy_grids: SceneOccupancyGrid[] = [];

  for (const mapped of sceneTopics) {
    const raw = await getRawMessage(mapped.topic, time_ns);
    if (!raw?.decoded) {
      continue;
    }

    if (mapped.archetype === "Pose") {
      const pose = extractPose(raw.decoded);
      if (!pose) {
        warnings.push(`Failed to parse pose from ${mapped.topic}`);
        continue;
      }
      const sourceFrame = pose.frame_id;
      const toFixed = tfBuffer.lookupTransformToFixed(sourceFrame, fixed_frame, time_ns);
      const resolved = toFixed ? transformPoseToFixed(pose, toFixed) : pose;
      poses.push({
        topic: mapped.topic,
        entity_path: mapped.entity_path,
        label: mapped.topic.split("/").pop() ?? mapped.topic,
        position: resolved.position,
        rotation: resolved.rotation,
      });
      continue;
    }

    if (mapped.archetype === "PointCloud") {
      const decoded = raw.decoded as Record<string, unknown>;
      const frame_id =
        (decoded.header as { frame_id?: string } | undefined)?.frame_id ??
        (decoded.frame_id as string | undefined) ??
        "base_link";
      const toFixed = tfBuffer.lookupTransformToFixed(frame_id, fixed_frame, time_ns);
      const parsed = parsePointCloud2(
        { ...decoded, frame_id } as DecodedPointCloud2,
        toFixed,
      );
      if (!parsed || parsed.point_count === 0) {
        warnings.push(`Failed to parse point cloud from ${mapped.topic}`);
        continue;
      }
      point_clouds.push({
        topic: mapped.topic,
        entity_path: mapped.entity_path,
        points: parsed.points,
        point_count: parsed.point_count,
      });
      continue;
    }

    if (mapped.archetype === "Trajectory" || mapped.archetype === "Lanelet2") {
      const trajectory = extractTrajectory(raw.decoded);
      if (trajectory && trajectory.point_count > 0) {
        const toFixed = tfBuffer.lookupTransformToFixed(
          trajectory.frame_id,
          fixed_frame,
          time_ns,
        );
        const resolved = toFixed
          ? transformTrajectoryToFixed(trajectory, toFixed)
          : trajectory;
        trajectories.push({
          topic: mapped.topic,
          entity_path: mapped.entity_path,
          archetype: mapped.archetype === "Lanelet2" ? "Lanelet2" : "Trajectory",
          points: resolved.points,
          point_count: resolved.point_count,
        });
        continue;
      }

      if (mapped.archetype === "Lanelet2") {
        const laneletMap = parseLaneletMapBin(raw.decoded);
        if (laneletMap && laneletMap.lanelets.length > 0) {
          for (const lanelet of laneletMap.lanelets) {
            const points = new Float32Array(lanelet.boundary.length * 3);
            for (let index = 0; index < lanelet.boundary.length; index += 1) {
              const [x, y, z] = lanelet.boundary[index]!;
              points[index * 3] = x;
              points[index * 3 + 1] = y;
              points[index * 3 + 2] = z;
            }
            trajectories.push({
              topic: mapped.topic,
              entity_path: mapped.entity_path,
              archetype: "Lanelet2",
              points,
              point_count: lanelet.boundary.length,
              closed: true,
            });
          }
          continue;
        }
        continue;
      }

      warnings.push(`Failed to parse trajectory from ${mapped.topic}`);
      continue;
    }

    if (mapped.archetype === "OccupancyGrid") {
      const grid = parseOccupancyGrid(raw.decoded);
      if (!grid) {
        warnings.push(`Failed to parse occupancy grid from ${mapped.topic}`);
        continue;
      }
      const toFixed = tfBuffer.lookupTransformToFixed(grid.frame_id, fixed_frame, time_ns);
      const resolved = toFixed ? transformOccupancyGridToFixed(grid, toFixed) : grid;
      occupancy_grids.push({
        topic: mapped.topic,
        entity_path: mapped.entity_path,
        width: resolved.width,
        height: resolved.height,
        resolution: resolved.resolution,
        origin: resolved.origin,
        rgba: resolved.rgba,
      });
    }
  }

  return {
    time_ns,
    fixed_frame,
    tf_frames,
    poses,
    point_clouds,
    trajectories,
    occupancy_grids,
    warnings,
  };
}
