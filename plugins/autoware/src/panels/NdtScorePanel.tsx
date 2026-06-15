import type { AutowareNdtView } from "../types.js";
import styles from "./AutowarePanel.module.css";
import { PanelShell } from "./PanelShell.js";

export function NdtScorePanel({ data }: { data?: AutowareNdtView }) {
  const ratio = data ? Math.min(1, Math.max(0, data.score / (data.threshold * 2))) : 0;

  return (
    <PanelShell
      title="NDT Score"
      tone={data ? (data.warning ? "warn" : "ok") : "missing"}
      label={data ? (data.warning ? "warning" : "ok") : "no data"}
      empty={!data}
      emptyMessage="Waiting for /localization/pose_estimator/ndt_score…"
    >
      {data ? (
        <>
          <p className={data.warning ? styles.scoreValueWarn : styles.scoreValue}>
            {data.score.toFixed(3)}
          </p>
          <dl className={styles.grid}>
            <dt>Topic</dt>
            <dd className={styles.mono}>{data.topic}</dd>
            <dt>Threshold</dt>
            <dd>{data.threshold.toFixed(2)}</dd>
          </dl>
          <div className={styles.barTrack}>
            <div
              className={data.warning ? styles.barFillWarn : styles.barFill}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        </>
      ) : null}
    </PanelShell>
  );
}
