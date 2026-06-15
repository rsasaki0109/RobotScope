export interface ResolvedNav2Topics {
  amcl_pose?: string;
  global_costmap?: string;
  global_plan?: string;
  local_plan?: string;
  goal?: string;
  cmd_vel?: string;
}

export interface Nav2AmclView {
  topic: string;
  frame_id: string;
  position: [number, number, number];
  yaw_deg: number;
  covariance_xy_m: number;
}

export interface Nav2CostmapView {
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

export interface Nav2PlanView {
  topic: string;
  point_count: number;
  length_m: number;
  end_point: [number, number, number];
}

export interface Nav2GoalView {
  topic: string;
  frame_id: string;
  position: [number, number, number];
  yaw_deg: number;
}

export interface Nav2ControllerView {
  topic: string;
  linear_x_mps: number;
  linear_y_mps: number;
  angular_z_rps: number;
}

export interface Nav2Snapshot {
  time_ns: number;
  topics: ResolvedNav2Topics;
  amcl?: Nav2AmclView;
  costmap?: Nav2CostmapView;
  global_plan?: Nav2PlanView;
  local_plan?: Nav2PlanView;
  goal?: Nav2GoalView;
  controller?: Nav2ControllerView;
  warnings: string[];
  failure_recipe?: import("./failure-recipes.js").FailureRecipeMatch | null;
  highlight_panels: import("./failure-recipes.js").Nav2PanelId[];
}
