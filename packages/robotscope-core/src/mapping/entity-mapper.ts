import type { ArchetypeName, Entity, EntityKind } from "../rdm.js";
import { EntityPaths } from "../entity-paths.js";

export interface TopicMappingRule {
  id: string;
  topicPattern: RegExp;
  schemaPattern?: RegExp;
  entityPath: string | ((topic: string) => string);
  archetype: ArchetypeName;
  kind: EntityKind;
}

export interface MappedTopic {
  topic: string;
  schema: string;
  entity_path: string;
  archetype: ArchetypeName;
  kind: EntityKind;
  rule_id: string;
}

const RULES: TopicMappingRule[] = [
  {
    id: "tf.dynamic",
    topicPattern: /^\/tf$/,
    schemaPattern: /TFMessage/i,
    entityPath: "/system/tf",
    archetype: "TF",
    kind: "system",
  },
  {
    id: "tf.static",
    topicPattern: /^\/tf_static$/,
    schemaPattern: /TFMessage/i,
    entityPath: "/system/tf_static",
    archetype: "TF",
    kind: "system",
  },
  {
    id: "localization.odometry",
    topicPattern: /^\/localization\/(kinematic_state|pose(?:_with_covariance)?)$/,
    schemaPattern: /Odometry/i,
    entityPath: EntityPaths.robot.ego.localization.pose,
    archetype: "Pose",
    kind: "robot",
  },
  {
    id: "planning.trajectory",
    topicPattern: /^\/planning\/(scenario_planning\/)?trajectory$/,
    schemaPattern: /Trajectory|Path/i,
    entityPath: EntityPaths.robot.ego.planning.trajectory,
    archetype: "Trajectory",
    kind: "robot",
  },
  {
    id: "localization.ndt_score",
    topicPattern: /^\/localization\/pose_estimator\/(ndt_score|scan_matching_score)$/,
    schemaPattern: /Float32/i,
    entityPath: "/robot/ego/localization/ndt_score",
    archetype: "Observation",
    kind: "robot",
  },
  {
    id: "nav2.amcl_pose",
    topicPattern: /^\/amcl_pose$/,
    schemaPattern: /PoseWithCovarianceStamped/i,
    entityPath: "/robot/ego/localization/amcl_pose",
    archetype: "Pose",
    kind: "robot",
  },
  {
    id: "nav2.global_plan",
    topicPattern: /^\/(plan|received_global_plan)$/,
    schemaPattern: /Path/i,
    entityPath: "/robot/ego/nav2/global_plan",
    archetype: "Trajectory",
    kind: "robot",
  },
  {
    id: "nav2.local_plan",
    topicPattern: /^\/(local_plan|transformed_global_plan)$/,
    schemaPattern: /Path/i,
    entityPath: "/robot/ego/nav2/local_plan",
    archetype: "Trajectory",
    kind: "robot",
  },
  {
    id: "nav2.goal",
    topicPattern: /^\/goal_pose$/,
    schemaPattern: /PoseStamped/i,
    entityPath: "/robot/ego/nav2/goal",
    archetype: "Pose",
    kind: "robot",
  },
  {
    id: "nav2.cmd_vel",
    topicPattern: /^\/cmd_vel$/,
    schemaPattern: /Twist/i,
    entityPath: EntityPaths.robot.ego.control.command,
    archetype: "Action",
    kind: "robot",
  },
  {
    id: "moveit.joint_states",
    topicPattern: /^\/joint_states$/,
    schemaPattern: /JointState/i,
    entityPath: "/robot/ego/manipulator/joint_states",
    archetype: "HumanoidState",
    kind: "robot",
  },
  {
    id: "moveit.display_trajectory",
    topicPattern: /^\/(display_planned_path|trajectory_execution\/display_planned_path)$/,
    schemaPattern: /Path|JointTrajectory/i,
    entityPath: "/robot/ego/manipulator/planned_trajectory",
    archetype: "Trajectory",
    kind: "robot",
  },
  {
    id: "control.command",
    topicPattern: /^\/control\/command\//,
    entityPath: EntityPaths.robot.ego.control.command,
    archetype: "Action",
    kind: "robot",
  },
  {
    id: "perception.objects",
    topicPattern: /^\/perception\/object_recognition\/(tracking\/)?objects$/,
    schemaPattern: /DetectedObjects|PredictedObjects/i,
    entityPath: "/world/objects",
    archetype: "Detection",
    kind: "world",
  },
  {
    id: "sensor.pointcloud",
    topicPattern: /\/points$/,
    schemaPattern: /PointCloud2/i,
    entityPath: (topic) => `/robot/ego/sensors${topic}`,
    archetype: "PointCloud",
    kind: "sensor",
  },
  {
    id: "sensor.image",
    topicPattern: /\/image(?:_raw|_compressed)?$/,
    schemaPattern: /Image/i,
    entityPath: (topic) => `/robot/ego/sensors${topic}`,
    archetype: "Image",
    kind: "sensor",
  },
  {
    id: "map.occupancy",
    topicPattern: /\/map$|\/map\/map$|costmap|pointcloud_map|occupancy/i,
    schemaPattern: /OccupancyGrid|Costmap/i,
    entityPath: "/world/map/occupancy",
    archetype: "OccupancyGrid",
    kind: "world",
  },
  {
    id: "map.lanelet2",
    topicPattern: /\/map\/(vector_map|lanelet2_map)$/,
    schemaPattern: /LaneletMapBin|MapBin|UInt8/i,
    entityPath: EntityPaths.world.map.lanelet2,
    archetype: "Lanelet2",
    kind: "world",
  },
  {
    id: "map.lanelet2.centerlines",
    topicPattern: /\/map\/lanelet2_centerlines$/,
    schemaPattern: /Path/i,
    entityPath: EntityPaths.world.map.lanelet2,
    archetype: "Lanelet2",
    kind: "world",
  },
  {
    id: "policy.vla",
    topicPattern: /vla|policy/i,
    entityPath: EntityPaths.policy.main.vlaState,
    archetype: "VLAState",
    kind: "policy",
  },
];

export function mapTopic(topic: string, schema: string): MappedTopic | undefined {
  for (const rule of RULES) {
    if (!rule.topicPattern.test(topic)) {
      continue;
    }
    if (rule.schemaPattern && !rule.schemaPattern.test(schema)) {
      continue;
    }

    const entity_path =
      typeof rule.entityPath === "function" ? rule.entityPath(topic) : rule.entityPath;

    return {
      topic,
      schema,
      entity_path,
      archetype: rule.archetype,
      kind: rule.kind,
      rule_id: rule.id,
    };
  }

  return undefined;
}

export function mapTopics(
  topics: Array<{ name: string; schema: string }>,
): MappedTopic[] {
  return topics
    .map((t) => mapTopic(t.name, t.schema))
    .filter((m): m is MappedTopic => m != null)
    .sort((a, b) => a.entity_path.localeCompare(b.entity_path));
}

export function mappedTopicToEntity(mapping: MappedTopic): Entity {
  return {
    id: `${mapping.entity_path}@${mapping.topic}`,
    path: mapping.entity_path,
    kind: mapping.kind,
    tags: [mapping.archetype, mapping.rule_id],
    provenance: {
      topic: mapping.topic,
      schema: mapping.schema,
    },
    components: [
      {
        name: "source",
        type: "provenance",
        time: {},
        value: {
          topic: mapping.topic,
          schema: mapping.schema,
          archetype: mapping.archetype,
        },
      },
    ],
  };
}
