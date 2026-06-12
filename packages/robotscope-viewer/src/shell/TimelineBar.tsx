import { useEffect, useRef } from "react";

import { useViewerStore } from "../store/viewer-store";
import { FailureRecipeStrip } from "./FailureRecipeStrip";
import styles from "./TimelineBar.module.css";

function formatTimeNs(ns: number): string {
  const sec = ns / 1e9;
  return sec.toFixed(2);
}

export function TimelineBar() {
  const session = useViewerStore((s) => s.session);
  const currentTimeNs = useViewerStore((s) => s.currentTimeNs);
  const isPlaying = useViewerStore((s) => s.isPlaying);
  const liveFollowing = useViewerStore((s) => s.liveFollowing);
  const recipeMarkers = useViewerStore((s) => s.recipeMarkers);
  const liveActiveRecipes = useViewerStore((s) => s.liveActiveRecipes);
  const recipeIndexLoading = useViewerStore((s) => s.recipeIndexLoading);
  const setCurrentTimeNs = useViewerStore((s) => s.setCurrentTimeNs);
  const setPlaying = useViewerStore((s) => s.setPlaying);
  const setLiveFollowing = useViewerStore((s) => s.setLiveFollowing);

  const isLive = session?.source === "live";
  const start = session?.start_ns ?? 0;
  const end = session?.end_ns ?? 0;
  const span = Math.max(end - start, 1);
  const progress = ((currentTimeNs - start) / span) * 100;

  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    if (isLive || !isPlaying || !session) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = (now: number) => {
      if (lastTickRef.current === 0) {
        lastTickRef.current = now;
      }
      const deltaSec = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      const next = Math.min(
        end,
        useViewerStore.getState().currentTimeNs + deltaSec * 1e9,
      );
      setCurrentTimeNs(next);

      if (next >= end) {
        setPlaying(false);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    lastTickRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isLive, isPlaying, session, end, setCurrentTimeNs, setPlaying]);

  if (!session) {
    return (
      <footer className={styles.bar}>
        <p className={styles.placeholder}>
          Timeline — load an MCAP recording or connect a live agent
        </p>
      </footer>
    );
  }

  return (
    <footer className={styles.bar}>
      <FailureRecipeStrip
        markers={recipeMarkers}
        currentTimeNs={currentTimeNs}
        startNs={start}
        endNs={end}
        isLive={isLive}
        liveActive={isLive ? liveActiveRecipes : undefined}
        onSeek={setCurrentTimeNs}
      />

      {!isLive && recipeIndexLoading ? (
        <p className={styles.indexing}>Indexing failure recipes across Autoware, Nav2, and MoveIt…</p>
      ) : null}

      {isLive ? (
        <button
          type="button"
          className={liveFollowing ? styles.followActive : styles.followButton}
          onClick={() => setLiveFollowing(!liveFollowing)}
          aria-label={liveFollowing ? "Pause live follow" : "Follow live stream"}
        >
          {liveFollowing ? "● LIVE" : "Follow"}
        </button>
      ) : (
        <button
          type="button"
          className={styles.playButton}
          onClick={() => setPlaying(!isPlaying)}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
      )}

      <input
        type="range"
        className={styles.slider}
        min={start}
        max={end}
        value={currentTimeNs}
        onChange={(e) => setCurrentTimeNs(Number(e.target.value))}
      />

      <span className={styles.time}>
        {formatTimeNs(currentTimeNs)} / {formatTimeNs(end)}
        {isLive ? " · live" : ""}
      </span>

      <div className={styles.progressTrack} aria-hidden>
        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
      </div>
    </footer>
  );
}
