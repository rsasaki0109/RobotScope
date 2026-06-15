import type { AutowarePlanningView } from "../types.js";
import styles from "./AutowarePanel.module.css";
import { PanelShell } from "./PanelShell.js";

export function PlanningPanel({ data }: { data?: AutowarePlanningView }) {
  return (
    <PanelShell
      title="Planning / Trajectory"
      tone={data ? "ok" : "missing"}
      label={data ? "live" : "no data"}
      empty={!data}
      emptyMessage="Waiting for /planning/scenario_planning/trajectory…"
    >
      {data ? (
        <dl className={styles.grid}>
          <dt>Topic</dt>
          <dd className={styles.mono}>{data.topic}</dd>
          <dt>Points</dt>
          <dd>{data.point_count}</dd>
          <dt>Length</dt>
          <dd>{data.length_m.toFixed(2)} m</dd>
          <dt>End point</dt>
          <dd>
            {data.end_point[0].toFixed(2)}, {data.end_point[1].toFixed(2)}, {data.end_point[2].toFixed(2)}
          </dd>
        </dl>
      ) : null}
    </PanelShell>
  );
}
