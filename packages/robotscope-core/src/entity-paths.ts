/**
 * Semantic entity paths — topic names map via provenance, not path.
 * @see docs/architecture.md §3.2
 */
export const EntityPaths = {
  world: {
    map: {
      lanelet2: "/world/map/lanelet2",
      pointcloud: "/world/map/pointcloud",
    },
    object: (trackId: string) => `/world/objects/${trackId}`,
  },
  robot: {
    ego: {
      baseLink: "/robot/ego/base_link",
      sensors: {
        lidarFront: "/robot/ego/sensors/lidar/front/points",
        cameraFront: "/robot/ego/sensors/camera/front/image",
      },
      localization: {
        pose: "/robot/ego/localization/pose",
      },
      planning: {
        trajectory: "/robot/ego/planning/trajectory",
      },
      control: {
        command: "/robot/ego/control/command",
      },
      humanoid: {
        joints: "/robot/ego/humanoid/joints",
      },
    },
  },
  policy: {
    main: {
      vlaState: "/policy/main/vla_state",
      action: "/policy/main/action",
      reward: "/policy/main/reward",
      memory: "/policy/main/memory",
    },
  },
  worldModel: {
    main: {
      predictedOccupancy: "/world_model/main/predicted_occupancy",
    },
  },
} as const;
