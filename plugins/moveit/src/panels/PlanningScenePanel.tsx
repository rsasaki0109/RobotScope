import type { MoveItPlanningSceneView } from "../types.js";
import styles from "./MoveItPanel.module.css";

export function PlanningScenePanel({ data }: { data?: MoveItPlanningSceneView }) {
  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Planning Scene</h3>
        <span className={data ? styles.badgeOk : styles.badgeMissing}>
          {data ? "live" : "no data"}
        </span>
      </div>
      {!data ? (
        <p className={styles.empty}>Waiting for /monitored_planning_scene…</p>
      ) : (
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
      )}
    </section>
  );
}
