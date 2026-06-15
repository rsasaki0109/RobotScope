import type { Nav2GoalView } from "../types.js";
import styles from "./Nav2Panel.module.css";
import { PanelShell } from "./PanelShell.js";

export function GoalPanel({ data }: { data?: Nav2GoalView }) {
  return (
    <PanelShell
      title="Navigation Goal"
      tone={data ? "ok" : "missing"}
      label={data ? "live" : "no data"}
      empty={!data}
      emptyMessage="Waiting for /goal_pose…"
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
        </dl>
      ) : null}
    </PanelShell>
  );
}
