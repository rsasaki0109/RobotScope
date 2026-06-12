import type { AutowareControlView } from "../types.js";
import styles from "./AutowarePanel.module.css";

export function ControlErrorPanel({ data }: { data?: AutowareControlView }) {
  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Control Error</h3>
        <span className={data ? styles.badgeOk : styles.badgeMissing}>
          {data ? "live" : "no data"}
        </span>
      </div>

      {!data ? (
        <p className={styles.empty}>
          Waiting for /control/trajectory_follower/*_error topics…
        </p>
      ) : (
        <dl className={styles.grid}>
          {data.lateral_error_m != null ? (
            <>
              <dt>Lateral</dt>
              <dd>{data.lateral_error_m.toFixed(4)} m</dd>
            </>
          ) : null}
          {data.longitudinal_error_m != null ? (
            <>
              <dt>Longitudinal</dt>
              <dd>{data.longitudinal_error_m.toFixed(4)} m</dd>
            </>
          ) : null}
          {data.lateral_error_topic ? (
            <>
              <dt>Lat topic</dt>
              <dd className={styles.mono}>{data.lateral_error_topic}</dd>
            </>
          ) : null}
        </dl>
      )}
    </section>
  );
}
