import type { Nav2AmclView } from "../types.js";
import styles from "./Nav2Panel.module.css";
import { PanelShell } from "./PanelShell.js";

export function AmclPanel({ data }: { data?: Nav2AmclView }) {
  const warn = data != null && data.covariance_xy_m > 0.35;

  return (
    <PanelShell
      title="AMCL Pose"
      tone={data ? (warn ? "warn" : "ok") : "missing"}
      label={data ? (warn ? "warn" : "ok") : "no data"}
      empty={!data}
      emptyMessage="Waiting for /amcl_pose…"
    >
      {data ? (
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
          <dt>Covariance σ</dt>
          <dd>{data.covariance_xy_m.toFixed(3)} m</dd>
        </dl>
      ) : null}
    </PanelShell>
  );
}
