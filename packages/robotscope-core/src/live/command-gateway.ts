/** Permission-gated live command publish (v0.8 alpha). */

export const DEFAULT_CMD_VEL_TOPIC = "/cmd_vel";
export const GEOMETRY_TWIST_SCHEMA = "geometry_msgs/msg/Twist";

export interface LiveCommandPublishRequest {
  topic: string;
  schema: string;
  /** Agent builds an all-zero Twist when true (alpha shortcut). */
  zero_twist?: boolean;
  /** Raw CDR payload when zero_twist is not used. */
  data_b64?: string;
}

export interface LiveCommandPublishResult {
  ok: boolean;
  topic?: string;
  message: string;
}

export function buildZeroTwistPublishRequest(
  topic: string = DEFAULT_CMD_VEL_TOPIC,
): LiveCommandPublishRequest {
  return {
    topic,
    schema: GEOMETRY_TWIST_SCHEMA,
    zero_twist: true,
  };
}
