import type { AutowareGnssView } from "../types.js";
import styles from "./AutowarePanel.module.css";

export function GnssPanel({
  data,
}: {
  data?: AutowareGnssView;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>GNSS Pose</h3>
        <span className={data ? styles.badgeOk : styles.badgeMissing}>
          {data ? "live" : "no data"}
        </span>
      </div>

      {!data ? (
        <p className={styles.empty}>Waiting for /sensing/gnss/pose…</p>
      ) : (
        <dl className={styles.grid}>
          <dt>Topic</dt>
          <dd className={styles.mono}>{data.topic}</dd>
          <dt>Frame</dt>
          <dd>{data.header_frame}</dd>
          <dt>Position</dt>
          <dd>
            x {data.position[0].toFixed(2)}, y {data.position[1].toFixed(2)} · alt{" "}
            {data.position[2].toFixed(2)}
          </dd>
          <dt>Yaw</dt>
          <dd>{data.yaw_deg.toFixed(1)}°</dd>
          <dt>Horizontal σ</dt>
          <dd>{data.covariance_xy_m.toFixed(3)} m</dd>
          <dt>Vertical σ</dt>
          <dd>{data.covariance_z_m.toFixed(3)} m</dd>
        </dl>
      )}
    </section>
  );
}
