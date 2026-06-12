import { useViewerStore } from "../store/viewer-store";
import styles from "./TfTreePanel.module.css";

export function TfTreePanel() {
  const tfTree = useViewerStore((s) => s.tfTree);
  const fixedFrame = useViewerStore((s) => s.fixedFrame);
  const session = useViewerStore((s) => s.session);

  if (!session) {
    return null;
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2>TF tree</h2>
        <span className={styles.meta}>
          {tfTree?.frames.length ?? 0} frames · fixed: {fixedFrame}
        </span>
      </div>

      {tfTree?.issues.length ? (
        <ul className={styles.issues}>
          {tfTree.issues.slice(0, 4).map((issue) => (
            <li key={`${issue.code}-${issue.frame_id}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      {!tfTree || tfTree.frames.length === 0 ? (
        <p className={styles.empty}>No TF indexed — check /tf and /tf_static topics.</p>
      ) : (
        <ul className={styles.tree}>
          {tfTree.frames.map((frame) => (
            <li key={frame.frame_id} className={styles.node}>
              <span className={styles.frame}>{frame.frame_id}</span>
              <span className={styles.edge}>
                {frame.parent_frame_id ? `← ${frame.parent_frame_id}` : "root"}
              </span>
              {frame.age_ms != null && !frame.is_static ? (
                <span className={styles.age}>{frame.age_ms.toFixed(0)} ms</span>
              ) : null}
              {frame.is_static ? <span className={styles.static}>static</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
