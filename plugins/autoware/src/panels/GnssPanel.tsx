import type { AutowareGnssView } from "../types.js";
import styles from "./AutowarePanel.module.css";
import { PanelShell } from "./PanelShell.js";

export function GnssPanel({
  data,
}: {
  data?: AutowareGnssView;
}) {
  return (
    <PanelShell
      title="GNSS Pose"
      tone={data ? "ok" : "missing"}
      label={data ? "live" : "no data"}
      empty={!data}
      emptyMessage="Waiting for /sensing/gnss/pose…"
    >
      {data ? (
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
      ) : null}
    </PanelShell>
  );
}
