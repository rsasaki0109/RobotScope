import { JOINT_VELOCITY_THRESHOLD_RPS } from "../failure-recipes.js";
import type { MoveItJointStateView } from "../types.js";
import styles from "./MoveItPanel.module.css";
import { PanelShell } from "./PanelShell.js";

export function JointDetailPanel({ data }: { data?: MoveItJointStateView }) {
  const fastestJoint = data?.joints.reduce<MoveItJointStateView["joints"][number] | undefined>(
    (fastest, joint) =>
      !fastest || Math.abs(joint.velocity) > Math.abs(fastest.velocity) ? joint : fastest,
    undefined,
  );
  const warn =
    data != null &&
    data.joints.some((joint) => Math.abs(joint.velocity) > JOINT_VELOCITY_THRESHOLD_RPS);

  return (
    <PanelShell
      title="Joint Detail"
      tone={data ? (warn ? "warn" : "ok") : "missing"}
      label={data ? (warn ? "warn" : "live") : "no data"}
      empty={!data}
      emptyMessage="Waiting for /joint_states..."
    >
      {data ? (
        <div className={styles.jointList}>
          {data.joints.map((joint, index) => {
            const velocity = Math.abs(joint.velocity);
            const isFastest = fastestJoint === joint;
            const isWarn = velocity > JOINT_VELOCITY_THRESHOLD_RPS;
            const className = [
              styles.jointRow,
              isFastest ? styles.jointRowFast : "",
              isWarn ? styles.jointRowWarn : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div className={className} key={`${joint.name}-${index}`}>
                <span className={styles.jointName}>
                  {joint.name}
                  {isFastest ? <strong className={styles.jointFlag}> fastest</strong> : null}
                </span>
                <span className={styles.jointMetric}>pos {joint.position.toFixed(3)} rad</span>
                <span className={styles.jointMetric}>vel {joint.velocity.toFixed(3)} rad/s</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </PanelShell>
  );
}
