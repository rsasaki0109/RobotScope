"""Default topic profiles aligned with RobotScope plugin manifests."""

from __future__ import annotations

PROFILE_TOPICS: dict[str, list[str]] = {
    "default": [
        "/tf",
        "/tf_static",
    ],
    "autoware": [
        "/tf",
        "/tf_static",
        "/localization/kinematic_state",
        "/localization/pose_estimator/ndt_score",
        "/planning/scenario_planning/trajectory",
        "/control/trajectory_follower/lateral_error",
        "/control/trajectory_follower/longitudinal_error",
        "/map/vector_map",
        "/map/map",
        "/map/lanelet2_centerlines",
        "/perception/object_recognition/objects",
    ],
    "nav2": [
        "/tf",
        "/tf_static",
        "/amcl_pose",
        "/local_costmap/costmap",
        "/plan",
        "/local_plan",
        "/goal_pose",
        "/cmd_vel",
    ],
    "moveit": [
        "/tf",
        "/tf_static",
        "/joint_states",
        "/monitored_planning_scene",
        "/display_planned_path",
    ],
}

IGNORED_TOPICS = {
    "/rosout",
    "/parameter_events",
    "/clock",
}
