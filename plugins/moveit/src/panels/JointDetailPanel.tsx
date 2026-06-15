import { JOINT_VELOCITY_THRESHOLD_RPS } from "../failure-recipes.js";
import type { MoveItJointStateView } from "../types.js";
import styles from "./MoveItPanel.module.css";

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
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Joint Detail</h3>
        <span className={data ? (warn ? styles.badgeWarn : styles.badgeOk) : styles.badgeMissing}>
          {data ? (warn ? "warn" : "live") : "no data"}
        </span>
      </div>
      {!data ? (
        <p className={styles.empty}>Waiting for /joint_states...</p>
      ) : (
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
      )}
    </section>
  );
}
