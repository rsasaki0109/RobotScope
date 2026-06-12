import type { Nav2CostmapView } from "../types.js";
import styles from "./Nav2Panel.module.css";

export function CostmapPanel({ data }: { data?: Nav2CostmapView }) {
  const total = data ? data.occupied_cells + data.free_cells + data.unknown_cells : 0;
  const occupiedPct = total > 0 && data ? (data.occupied_cells / total) * 100 : 0;

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Costmap</h3>
        <span className={data ? styles.badgeOk : styles.badgeMissing}>
          {data ? "live" : "no data"}
        </span>
      </div>
      {!data ? (
        <p className={styles.empty}>Waiting for /local_costmap/costmap…</p>
      ) : (
        <>
          <dl className={styles.grid}>
            <dt>Topic</dt>
            <dd className={styles.mono}>{data.topic}</dd>
            <dt>Size</dt>
            <dd>
              {data.width} × {data.height} @ {data.resolution_m.toFixed(3)} m
            </dd>
            <dt>Cells</dt>
            <dd>
              occ {data.occupied_cells} · free {data.free_cells} · unk {data.unknown_cells}
            </dd>
          </dl>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: `${occupiedPct}%` }} />
          </div>
        </>
      )}
    </section>
  );
}
