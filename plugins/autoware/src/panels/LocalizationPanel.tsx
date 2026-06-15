import type { AutowareLocalizationView } from "../types.js";
import styles from "./AutowarePanel.module.css";
import { PanelShell } from "./PanelShell.js";

export function LocalizationPanel({
  data,
}: {
  data?: AutowareLocalizationView;
}) {
  return (
    <PanelShell
      title="Localization Health"
      tone={data ? "ok" : "missing"}
      label={data ? "live" : "no data"}
      empty={!data}
      emptyMessage="Waiting for /localization/kinematic_state…"
    >
      {data ? (
        <dl className={styles.grid}>
          <dt>Topic</dt>
          <dd className={styles.mono}>{data.topic}</dd>
          <dt>Frame</dt>
          <dd>
            {data.header_frame} → {data.child_frame}
          </dd>
          <dt>Position</dt>
          <dd>
            {data.position[0].toFixed(2)}, {data.position[1].toFixed(2)}, {data.position[2].toFixed(2)}
          </dd>
          <dt>Yaw</dt>
          <dd>{data.yaw_deg.toFixed(1)}°</dd>
          <dt>Covariance σ</dt>
          <dd>
            xy {data.covariance_xy_m.toFixed(3)} m · yaw {data.covariance_yaw_deg.toFixed(2)}°
          </dd>
          <dt>Twist</dt>
          <dd>
            vx {data.linear_x_mps.toFixed(2)} m/s · ωz {data.angular_z_rps.toFixed(3)} rad/s
          </dd>
        </dl>
      ) : null}
    </PanelShell>
  );
}
