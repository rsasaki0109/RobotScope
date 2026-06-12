import type { Nav2GoalView } from "../types.js";
import styles from "./Nav2Panel.module.css";

export function GoalPanel({ data }: { data?: Nav2GoalView }) {
  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Navigation Goal</h3>
        <span className={data ? styles.badgeOk : styles.badgeMissing}>
          {data ? "live" : "no data"}
        </span>
      </div>
      {!data ? (
        <p className={styles.empty}>Waiting for /goal_pose…</p>
      ) : (
        <dl className={styles.grid}>
          <dt>Topic</dt>
          <dd className={styles.mono}>{data.topic}</dd>
          <dt>Frame</dt>
          <dd>{data.frame_id}</dd>
          <dt>Position</dt>
          <dd>
            {data.position[0].toFixed(2)}, {data.position[1].toFixed(2)}, {data.position[2].toFixed(2)}
          </dd>
          <dt>Yaw</dt>
          <dd>{data.yaw_deg.toFixed(1)}°</dd>
        </dl>
      )}
    </section>
  );
}
