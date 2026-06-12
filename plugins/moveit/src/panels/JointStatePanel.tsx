import type { MoveItJointStateView } from "../types.js";
import styles from "./MoveItPanel.module.css";

export function JointStatePanel({ data }: { data?: MoveItJointStateView }) {
  const warn = data != null && data.max_velocity_rps > 2.5;

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Joint States</h3>
        <span className={data ? (warn ? styles.badgeWarn : styles.badgeOk) : styles.badgeMissing}>
          {data ? (warn ? "warn" : "ok") : "no data"}
        </span>
      </div>
      {!data ? (
        <p className={styles.empty}>Waiting for /joint_states…</p>
      ) : (
        <dl className={styles.grid}>
          <dt>Topic</dt>
          <dd className={styles.mono}>{data.topic}</dd>
          <dt>Joints</dt>
          <dd>{data.joint_count}</dd>
          <dt>Position range</dt>
          <dd>
            {data.position_min.toFixed(3)} … {data.position_max.toFixed(3)} rad
          </dd>
          <dt>Max |velocity|</dt>
          <dd>{data.max_velocity_rps.toFixed(3)} rad/s</dd>
          <dt>Sample</dt>
          <dd>{data.sample_joints.join(", ") || "—"}</dd>
        </dl>
      )}
    </section>
  );
}
