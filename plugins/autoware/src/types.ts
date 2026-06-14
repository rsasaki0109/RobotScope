export interface ResolvedAutowareTopics {
  localization_pose?: string;
  ndt_score?: string;
  planning_trajectory?: string;
  control_lateral_error?: string;
  control_longitudinal_error?: string;
  control_cmd_vel?: string;
  gnss_pose?: string;
  map_vector?: string;
  map_occupancy?: string;
  map_lanelet_centerlines?: string;
  perception_objects?: string;
}

export interface LaneletPolyline2D {
  points: Array<[number, number]>;
}

export interface AutowareLanelet2View {
  topic: string;
  byte_size: number;
  format_version?: string | number;
  lanelet_count?: number;
  boundary_point_count?: number;
  parse_format?: "demo-rl2d" | "boost-lanelet2" | "unknown";
  boundaries?: LaneletPolyline2D[];
  centerlines?: LaneletPolyline2D[];
}

export interface AutowareOccupancyMapView {
  topic: string;
  frame_id: string;
  width: number;
  height: number;
  resolution_m: number;
  origin_xy: [number, number];
  occupied_cells: number;
  free_cells: number;
  unknown_cells: number;
  cells: number[];
}

export interface LaneletOsmLaneletView {
  left_bound?: LaneletPolyline2D;
  right_bound?: LaneletPolyline2D;
  centerline?: LaneletPolyline2D;
}

export interface LaneletOsmRegulatoryView {
  subtype: string;
  members: Array<{ role: string; points: Array<[number, number]> }>;
}

export interface LaneletOsmSidecarView {
  format: "autoware-osm";
  node_count: number;
  way_count: number;
  lanelet_count: number;
  regulatory_element_count: number;
  regulatory_subtypes?: Record<string, number>;
  ways: LaneletPolyline2D[];
  lanelets?: LaneletOsmLaneletView[];
  regulatory_elements?: LaneletOsmRegulatoryView[];
}

export interface AutowareMapView {
  lanelet2?: AutowareLanelet2View;
  occupancy?: AutowareOccupancyMapView;
  osm_sidecar?: LaneletOsmSidecarView;
}

export interface AutowareLocalizationView {
  topic: string;
  header_frame: string;
  child_frame: string;
  position: [number, number, number];
  yaw_deg: number;
  covariance_xy_m: number;
  covariance_yaw_deg: number;
  linear_x_mps: number;
  angular_z_rps: number;
}

export interface AutowareNdtView {
  topic: string;
  score: number;
  warning: boolean;
  threshold: number;
}

export interface AutowarePlanningView {
  topic: string;
  point_count: number;
  length_m: number;
  end_point: [number, number, number];
}

export interface AutowareControlView {
  lateral_error_topic?: string;
  longitudinal_error_topic?: string;
  cmd_vel_topic?: string;
  lateral_error_m?: number;
  longitudinal_error_m?: number;
  linear_x_mps?: number;
}

export interface AutowarePerceptionObjectView {
  label: string;
  existence_probability: number;
  position: [number, number, number];
}

export interface AutowarePerceptionView {
  topic: string;
  frame_id: string;
  object_count: number;
  max_existence_probability: number;
  low_confidence_count: number;
  brief_spike: boolean;
  objects: AutowarePerceptionObjectView[];
}

export interface AutowareSnapshot {
  time_ns: number;
  topics: ResolvedAutowareTopics;
  map?: AutowareMapView;
  localization?: AutowareLocalizationView;
  ndt?: AutowareNdtView;
  planning?: AutowarePlanningView;
  control?: AutowareControlView;
  perception?: AutowarePerceptionView;
  warnings: string[];
  failure_recipe?: import("./failure-recipes.js").FailureRecipeMatch | null;
  highlight_panels: import("./failure-recipes.js").AutowarePanelId[];
}
