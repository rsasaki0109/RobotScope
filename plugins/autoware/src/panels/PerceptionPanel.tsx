import type { AutowarePerceptionView } from "../types.js";
import styles from "./AutowarePanel.module.css";

export function PerceptionPanel({ data }: { data?: AutowarePerceptionView }) {
  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Perception Objects</h3>
        <span className={data ? (data.low_confidence_count > 0 ? styles.badgeWarn : styles.badgeOk) : styles.badgeMissing}>
          {data ? `${data.object_count} obj` : "no data"}
        </span>
      </div>

      {!data ? (
        <p className={styles.empty}>Waiting for /perception/object_recognition/objects…</p>
      ) : data.object_count === 0 ? (
        <p className={styles.empty}>No tracked objects at this time</p>
      ) : (
        <>
          <dl className={styles.grid}>
            <dt>Topic</dt>
            <dd className={styles.mono}>{data.topic}</dd>
            <dt>Frame</dt>
            <dd>{data.frame_id}</dd>
            <dt>Max confidence</dt>
            <dd>{data.max_existence_probability.toFixed(2)}</dd>
            <dt>Low confidence</dt>
            <dd>{data.low_confidence_count}</dd>
            {data.brief_spike ? (
              <>
                <dt>Spike</dt>
                <dd>brief detection</dd>
              </>
            ) : null}
          </dl>
          <ul className={styles.objectList}>
            {data.objects.slice(0, 5).map((object, index) => (
              <li key={`${object.label}-${index}`}>
                <span className={styles.mono}>{object.label}</span> · p=
                {object.existence_probability.toFixed(2)} · (
                {object.position[0].toFixed(2)}, {object.position[1].toFixed(2)})
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
