import type { AutowareControlView } from "../types.js";
import styles from "./AutowarePanel.module.css";
import { PanelShell } from "./PanelShell.js";

export function ControlErrorPanel({ data }: { data?: AutowareControlView }) {
  const warn =
    data != null &&
    (Math.abs(data.lateral_error_m ?? 0) > 0.15 ||
      Math.abs(data.longitudinal_error_m ?? 0) > 0.12);

  return (
    <PanelShell
      title="Control Error"
      tone={data ? (warn ? "warn" : "ok") : "missing"}
      label={data ? "live" : "no data"}
      empty={!data}
      emptyMessage="Waiting for /control/trajectory_follower/*_error topics…"
    >
      {data ? (
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
          {data.linear_x_mps != null ? (
            <>
              <dt>Cmd vel (linear.x)</dt>
              <dd>{data.linear_x_mps.toFixed(3)} m/s</dd>
            </>
          ) : null}
          {data.lateral_error_topic ? (
            <>
              <dt>Lat topic</dt>
              <dd className={styles.mono}>{data.lateral_error_topic}</dd>
            </>
          ) : null}
          {data.cmd_vel_topic ? (
            <>
              <dt>Cmd topic</dt>
              <dd className={styles.mono}>{data.cmd_vel_topic}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </PanelShell>
  );
}
