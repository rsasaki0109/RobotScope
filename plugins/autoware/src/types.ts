export interface ResolvedAutowareTopics {
  localization_pose?: string;
  ndt_score?: string;
  planning_trajectory?: string;
  control_lateral_error?: string;
  control_longitudinal_error?: string;
  gnss_pose?: string;
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
  lateral_error_m?: number;
  longitudinal_error_m?: number;
}

export interface AutowareSnapshot {
  time_ns: number;
  topics: ResolvedAutowareTopics;
  localization?: AutowareLocalizationView;
  ndt?: AutowareNdtView;
  planning?: AutowarePlanningView;
  control?: AutowareControlView;
  warnings: string[];
}
