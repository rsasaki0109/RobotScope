/** Permission-gated live command publish (v0.9+). */

export const DEFAULT_CMD_VEL_TOPIC = "/cmd_vel";
export const GEOMETRY_TWIST_SCHEMA = "geometry_msgs/msg/Twist";

export interface TwistVelocityCommand {
  linear_x: number;
  linear_y: number;
  linear_z: number;
  angular_x: number;
  angular_y: number;
  angular_z: number;
}

export interface LiveCommandPublishRequest {
  topic: string;
  schema: string;
  /** Agent builds Twist from linear / angular components (v0.9+). */
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

const TWIST_FIELDS: Array<keyof TwistVelocityCommand> = [
  "linear_x",
  "linear_y",
  "linear_z",
  "angular_x",
  "angular_y",
  "angular_z",
];

function assertFiniteVelocity(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

export function normalizeTwistVelocityCommand(
  velocity: Partial<TwistVelocityCommand>,
): TwistVelocityCommand {
  return {
    linear_x: assertFiniteVelocity(velocity.linear_x ?? 0, "linear_x"),
    linear_y: assertFiniteVelocity(velocity.linear_y ?? 0, "linear_y"),
    linear_z: assertFiniteVelocity(velocity.linear_z ?? 0, "linear_z"),
    angular_x: assertFiniteVelocity(velocity.angular_x ?? 0, "angular_x"),
    angular_y: assertFiniteVelocity(velocity.angular_y ?? 0, "angular_y"),
    angular_z: assertFiniteVelocity(velocity.angular_z ?? 0, "angular_z"),
  };
}

export function formatTwistVelocitySummary(velocity: TwistVelocityCommand): string {
  const parts = TWIST_FIELDS.map((field) => {
    const value = velocity[field];
    if (Math.abs(value) < 1e-9) {
      return null;
    }
    const label =
      field === "linear_x"
        ? "vx"
        : field === "linear_y"
          ? "vy"
          : field === "linear_z"
            ? "vz"
            : field === "angular_x"
              ? "ωx"
              : field === "angular_y"
                ? "ωy"
                : "ωz";
    return `${label}=${value.toFixed(2)}`;
  }).filter((part): part is string => part != null);

  return parts.length > 0 ? parts.join(" ") : "vx=0 ωz=0";
}

export function buildTwistPublishRequest(
  velocity: Partial<TwistVelocityCommand>,
  topic: string = DEFAULT_CMD_VEL_TOPIC,
): LiveCommandPublishRequest {
  return {
    topic,
    schema: GEOMETRY_TWIST_SCHEMA,
    twist: normalizeTwistVelocityCommand(velocity),
  };
}

export function buildZeroTwistPublishRequest(
  topic: string = DEFAULT_CMD_VEL_TOPIC,
): LiveCommandPublishRequest {
  return buildTwistPublishRequest(
    {
      linear_x: 0,
      linear_y: 0,
      linear_z: 0,
      angular_x: 0,
      angular_y: 0,
      angular_z: 0,
    },
    topic,
  );
}
