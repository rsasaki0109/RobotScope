import type { Nav2PlanView } from "../types.js";
import styles from "./Nav2Panel.module.css";

export function PlanPanel({
  title,
  data,
  emptyHint,
}: {
  title: string;
  data?: Nav2PlanView;
  emptyHint: string;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <span className={data ? styles.badgeOk : styles.badgeMissing}>
          {data ? "live" : "no data"}
        </span>
      </div>
      {!data ? (
        <p className={styles.empty}>{emptyHint}</p>
      ) : (
        <dl className={styles.grid}>
          <dt>Topic</dt>
          <dd className={styles.mono}>{data.topic}</dd>
          <dt>Points</dt>
          <dd>{data.point_count}</dd>
          <dt>Length</dt>
          <dd>{data.length_m.toFixed(2)} m</dd>
          <dt>End</dt>
          <dd>
            {data.end_point[0].toFixed(2)}, {data.end_point[1].toFixed(2)}
          </dd>
        </dl>
      )}
    </section>
  );
}
