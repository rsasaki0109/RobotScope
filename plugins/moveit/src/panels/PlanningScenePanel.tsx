import type { MoveItPlanningSceneView } from "../types.js";
import styles from "./MoveItPanel.module.css";
import { PanelShell } from "./PanelShell.js";

export function PlanningScenePanel({ data }: { data?: MoveItPlanningSceneView }) {
  return (
    <PanelShell
      title="Planning Scene"
      tone={data ? "ok" : "missing"}
      label={data ? "live" : "no data"}
      empty={!data}
      emptyMessage="Waiting for /monitored_planning_scene…"
    >
      {data ? (
        <dl className={styles.grid}>
          <dt>Topic</dt>
          <dd className={styles.mono}>{data.topic}</dd>
          <dt>Scene</dt>
          <dd>{data.scene_name ?? "—"}</dd>
          <dt>Robot joints</dt>
          <dd>{data.robot_joint_count}</dd>
          <dt>Collision objs</dt>
          <dd>{data.collision_object_count}</dd>
          <dt>Attached objs</dt>
          <dd>{data.attached_object_count}</dd>
        </dl>
      ) : null}
    </PanelShell>
  );
}
