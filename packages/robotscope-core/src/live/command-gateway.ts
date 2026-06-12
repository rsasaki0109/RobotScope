/** Permission-gated live command publish (v0.9 alpha). */

export const DEFAULT_CMD_VEL_TOPIC = "/cmd_vel";
export const GEOMETRY_TWIST_SCHEMA = "geometry_msgs/msg/Twist";

export interface TwistVelocityCommand {
  linear_x: number;
  angular_z: number;
}

export interface LiveCommandPublishRequest {
  topic: string;
  schema: string;
  /** Agent builds Twist from linear_x / angular_z (v0.9 alpha). */
  twist?: TwistVelocityCommand;
  /** Agent builds an all-zero Twist when true. */
  zero_twist?: boolean;
  /** Raw CDR payload when twist shortcuts are not used. */
  data_b64?: string;
}

export interface LiveCommandPublishResult {
  ok: boolean;
  topic?: string;
  message: string;
}

function assertFiniteVelocity(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

export function buildTwistPublishRequest(
  velocity: TwistVelocityCommand,
  topic: string = DEFAULT_CMD_VEL_TOPIC,
): LiveCommandPublishRequest {
  return {
    topic,
    schema: GEOMETRY_TWIST_SCHEMA,
    twist: {
      linear_x: assertFiniteVelocity(velocity.linear_x, "linear_x"),
      angular_z: assertFiniteVelocity(velocity.angular_z, "angular_z"),
    },
  };
}

export function buildZeroTwistPublishRequest(
  topic: string = DEFAULT_CMD_VEL_TOPIC,
): LiveCommandPublishRequest {
  return buildTwistPublishRequest({ linear_x: 0, angular_z: 0 }, topic);
}
