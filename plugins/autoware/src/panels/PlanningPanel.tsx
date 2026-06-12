import type { AutowarePlanningView } from "../types.js";
import styles from "./AutowarePanel.module.css";

export function PlanningPanel({ data }: { data?: AutowarePlanningView }) {
  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Planning / Trajectory</h3>
        <span className={data ? styles.badgeOk : styles.badgeMissing}>
          {data ? "live" : "no data"}
        </span>
      </div>

      {!data ? (
        <p className={styles.empty}>Waiting for /planning/scenario_planning/trajectory…</p>
      ) : (
        <dl className={styles.grid}>
          <dt>Topic</dt>
          <dd className={styles.mono}>{data.topic}</dd>
          <dt>Points</dt>
          <dd>{data.point_count}</dd>
          <dt>Length</dt>
          <dd>{data.length_m.toFixed(2)} m</dd>
          <dt>End point</dt>
          <dd>
            {data.end_point[0].toFixed(2)}, {data.end_point[1].toFixed(2)}, {data.end_point[2].toFixed(2)}
          </dd>
        </dl>
      )}
    </section>
  );
}
