import type { MoveItTrajectoryView } from "../types.js";
import styles from "./MoveItPanel.module.css";

export function TrajectoryPanel({ data }: { data?: MoveItTrajectoryView }) {
  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Planned Trajectory</h3>
        <span className={data ? styles.badgeOk : styles.badgeMissing}>
          {data ? "live" : "no data"}
        </span>
      </div>
      {!data ? (
        <p className={styles.empty}>Waiting for /display_planned_path…</p>
      ) : (
        <dl className={styles.grid}>
          <dt>Topic</dt>
          <dd className={styles.mono}>{data.topic}</dd>
          <dt>Points</dt>
          <dd>{data.point_count}</dd>
          <dt>Duration</dt>
          <dd>{data.duration_sec.toFixed(2)} s</dd>
          <dt>Joints</dt>
          <dd>{data.joint_names.slice(0, 4).join(", ") || "—"}</dd>
        </dl>
      )}
    </section>
  );
}
