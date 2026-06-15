import type { Nav2ControllerView } from "../types.js";
import styles from "./Nav2Panel.module.css";
import { PanelShell } from "./PanelShell.js";

export function ControllerPanel({ data }: { data?: Nav2ControllerView }) {
  return (
    <PanelShell
      title="Controller Output"
      tone={data ? "ok" : "missing"}
      label={data ? "live" : "no data"}
      empty={!data}
      emptyMessage="Waiting for /cmd_vel…"
    >
      {data ? (
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
      ) : null}
    </PanelShell>
  );
}
