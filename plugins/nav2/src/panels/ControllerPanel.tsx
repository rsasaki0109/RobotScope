import type { Nav2ControllerView } from "../types.js";
import styles from "./Nav2Panel.module.css";

export function ControllerPanel({ data }: { data?: Nav2ControllerView }) {
  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Controller Output</h3>
        <span className={data ? styles.badgeOk : styles.badgeMissing}>
          {data ? "live" : "no data"}
        </span>
      </div>
      {!data ? (
        <p className={styles.empty}>Waiting for /cmd_vel…</p>
      ) : (
        <dl className={styles.grid}>
          <dt>Topic</dt>
          <dd className={styles.mono}>{data.topic}</dd>
          <dt>Linear</dt>
          <dd>
            x {data.linear_x_mps.toFixed(3)} · y {data.linear_y_mps.toFixed(3)} m/s
          </dd>
          <dt>Angular</dt>
          <dd>{data.angular_z_rps.toFixed(3)} rad/s</dd>
        </dl>
      )}
    </section>
  );
}
