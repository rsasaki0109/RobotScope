/** RobotScope Data Model (RDM) — TypeScript definitions aligned with schemas/rdm/v0.1 */

export type EntityKind =
  | "world"
  | "robot"
  | "sensor"
  | "policy"
  | "world_model"
  | "annotation"
  | "system";

export interface Timeline {
  log_time_ns?: number;
  sensor_time_ns?: number;
  valid_time_ns?: number;
  sim_time_ns?: number;
  model_step?: number;
  episode_step?: number;
}

export interface FrameRef {
  frame_id: string;
  parent_frame_id?: string;
  transform?: {
    translation: [number, number, number];
    rotation: [number, number, number, number];
  };
  covariance?: number[];
  authority?: string;
  validity?: { from_ns?: number; to_ns?: number };
}

export interface Provenance {
  topic?: string;
  node?: string;
  schema?: string;
  qos?: Record<string, unknown>;
  channel_id?: number;
  sequence?: number;
}

export interface ComponentQuality {
  score?: number;
  uncertainty?: number;
  flags?: string[];
}

export interface Component {
  name: string;
  type: string;
  value?: unknown;
  buffer_ref?: string;
  time: Timeline;
  frame?: FrameRef;
  quality?: ComponentQuality;
  source?: Provenance;
}

export interface Entity {
  id: string;
  path: string;
  kind: EntityKind;
  parent?: string;
  components?: Component[];
  tags?: string[];
  provenance?: Provenance;
}

export type ArchetypeName =
  | "Image"
  | "Depth"
  | "PointCloud"
  | "Pose"
  | "Trajectory"
  | "RobotModel"
  | "TF"
  | "OccupancyGrid"
  | "Costmap"
  | "Lanelet2"
  | "Detection"
  | "Tracking"
  | "Action"
  | "Observation"
  | "WorldModel"
  | "VLAState"
  | "HumanoidState"
  | "3DGS"
  | "NeRF";

export interface Archetype {
  name: ArchetypeName;
  required_components: string[];
  optional_components: string[];
}

export interface CausalityLink {
  id: string;
  produced_by: string;
  consumed?: string[];
  input_refs?: string[];
  output_refs?: string[];
  action_id?: string;
  observation_id?: string;
  model_id?: string;
  time_ns: number;
}

export type TransformPolicy =
  | "STRICT"
  | "NEAREST"
  | "INTERPOLATE"
  | "PREDICTED"
  | "STATIC";

export interface EntityRef {
  entity_id: string;
  path: string;
  time_ns?: number;
}
