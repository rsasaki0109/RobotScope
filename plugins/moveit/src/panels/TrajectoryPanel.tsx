import type { MoveItTrajectoryView } from "../types.js";
import styles from "./MoveItPanel.module.css";
import { PanelShell } from "./PanelShell.js";

export function TrajectoryPanel({ data }: { data?: MoveItTrajectoryView }) {
  return (
    <PanelShell
      title="Planned Trajectory"
      tone={data ? "ok" : "missing"}
      label={data ? "live" : "no data"}
      empty={!data}
      emptyMessage="Waiting for /display_planned_path…"
    >
      {data ? (
        <dl className={styles.grid}>
          <dt>Topic</dt>
          <dd className={styles.mono}>{data.topic}</dd>
          <dt>Points</dt>
          <dd>{data.point_count}</dd>
          <dt>Duration</dt>
          <dd>{data.duration_sec.toFixed(2)} s</dd>
          <dt>Joints</dt>
          <dd>{data.joint_names.slice(0, 4).join(", ") || "—"}</dd>
        </dl>
      ) : null}
    </PanelShell>
  );
}
