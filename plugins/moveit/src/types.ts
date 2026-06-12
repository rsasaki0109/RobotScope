export interface ResolvedMoveItTopics {
  joint_states?: string;
  planning_scene?: string;
  display_trajectory?: string;
}

export interface MoveItJointStateView {
  topic: string;
  joint_count: number;
  position_min: number;
  position_max: number;
  max_velocity_rps: number;
  sample_joints: string[];
}

export interface MoveItPlanningSceneView {
  topic: string;
  scene_name?: string;
  robot_joint_count: number;
  collision_object_count: number;
  attached_object_count: number;
}

export interface MoveItTrajectoryView {
  topic: string;
  point_count: number;
  joint_names: string[];
  duration_sec: number;
}

export interface MoveItSnapshot {
  time_ns: number;
  topics: ResolvedMoveItTopics;
  joint_states?: MoveItJointStateView;
  planning_scene?: MoveItPlanningSceneView;
  trajectory?: MoveItTrajectoryView;
  warnings: string[];
  failure_recipe?: import("./failure-recipes.js").FailureRecipeMatch | null;
  highlight_panels: import("./failure-recipes.js").MoveItPanelId[];
}
