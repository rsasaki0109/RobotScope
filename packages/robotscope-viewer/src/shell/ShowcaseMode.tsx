import { isMcapQueryEngine } from "@robotscope/core";
import { useEffect, useMemo, useState } from "react";

import { explainIncident, type IncidentExplanation } from "../incidents/explain.js";
import { findIncidentBySlug, groupRecipeMarkers } from "../incidents/model.js";
import { resolveShowcaseStory, SHOWCASE_DURATION_MS } from "../showcase/story.js";
import { useViewerStore } from "../store/viewer-store";
import { SceneView3D } from "./SceneView3D";
import styles from "./ShowcaseMode.module.css";

const SHOWCASE_ALIASES: Record<string, string> = {
  "phantom-stop": "phantom-obstacle-stop",
};

function isCaptureMode(): boolean {
  return new URLSearchParams(window.location.search).get("capture") === "1";
}

function evidenceByLabel(explanation: IncidentExplanation | null, label: string) {
  return explanation?.facts.find((evidence) => evidence.label === label);
}

export interface ShowcaseModeProps {
  incident: string;
}

export function ShowcaseMode({ incident }: ShowcaseModeProps) {
  const session = useViewerStore((state) => state.session);
  const ingest = useViewerStore((state) => state.ingest);
  const markers = useViewerStore((state) => state.recipeMarkers);
  const setCurrentTimeNs = useViewerStore((state) => state.setCurrentTimeNs);
  const setLayoutId = useViewerStore((state) => state.setLayoutId);
  const incidents = useMemo(() => groupRecipeMarkers(markers), [markers]);
  const requested = SHOWCASE_ALIASES[incident] ?? incident;
  const selected = findIncidentBySlug(incidents, requested) ?? null;
  const [explanation, setExplanation] = useState<IncidentExplanation | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const ready = Boolean(session && selected && explanation && explanation.facts.length > 0);
  const story = resolveShowcaseStory(elapsedMs);

  useEffect(() => {
    if (!selected) return;
    setLayoutId("autoware");
  }, [selected, setLayoutId]);

  useEffect(() => {
    const engine = ingest?.engine;
    if (!selected || !session || !engine || !isMcapQueryEngine(engine)) {
      setExplanation(null);
      return;
    }
    let cancelled = false;
    void explainIncident(engine, session, selected.marker).then((result) => {
      if (!cancelled) setExplanation(result);
    });
    return () => {
      cancelled = true;
    };
  }, [ingest, selected, session]);

  useEffect(() => {
    if (!ready) return;

    const handleCaptureTime = (event: Event) => {
      const next = (event as CustomEvent<number>).detail;
      if (Number.isFinite(next)) setElapsedMs(next);
    };
    window.addEventListener("robotscope:showcase-time", handleCaptureTime);

    if (isCaptureMode()) {
      return () => window.removeEventListener("robotscope:showcase-time", handleCaptureTime);
    }

    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      setElapsedMs((performance.now() - startedAt) % SHOWCASE_DURATION_MS);
    }, 50);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("robotscope:showcase-time", handleCaptureTime);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || !session) return;
    const target = session.start_ns + story.incident_time_sec * 1e9;
    const current = useViewerStore.getState().currentTimeNs;
    if (Math.abs(current - target) >= 20_000_000) setCurrentTimeNs(target);
  }, [ready, session, setCurrentTimeNs, story.incident_time_sec]);

  if (!ready || !session || !selected || !explanation) {
    return (
      <main className={styles.loading} data-showcase-ready="false">
        <div className={styles.loadingMark}>RS</div>
        <strong>RobotScope</strong>
        <span>Loading the incident from MCAP…</span>
      </main>
    );
  }

  const trajectory = evidenceByLabel(explanation, "Planned trajectory length");
  const perception = evidenceByLabel(explanation, "Perception objects");
  const incidentElapsed = (selected.start_ns - session.start_ns) / 1e9;

  return (
    <main
      className={styles.showcase}
      data-showcase-ready="true"
      data-showcase-phase={story.phase}
      aria-label="RobotScope incident showcase"
    >
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>RS</span>
          <div><strong>RobotScope</strong><small>Open observability for robots</small></div>
        </div>
        <div className={styles.headerMeta}>
          <span>MCAP</span><span>ROS 2</span><span>LOCAL · PRIVATE</span>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.scene} aria-label="Robot scene at incident time">
          <SceneView3D />
          <div className={styles.sceneShade} />
          <div className={styles.timecode}>
            <span>INCIDENT</span>
            <strong>{story.incident_time_sec.toFixed(2)}s</strong>
          </div>
          <div className={styles.signalTrace}>
            <div><span>SENSED</span><i className={story.phase === "replay" ? styles.signalPulse : ""} /></div>
            <div><span>BELIEVED</span><i /></div>
            <div><span>PLANNED</span><i className={story.phase === "replay" ? styles.signalWarn : ""} /></div>
            <div><span>COMMANDED</span><i /></div>
          </div>
        </section>

        <section className={styles.story}>
          <div className={`${styles.storyPanel} ${styles.question}`}>
            <span className={styles.kicker}>A ROBOT INCIDENT · {incidentElapsed.toFixed(2)}s</span>
            <h1>The robot stopped.<br /><em>Why?</em></h1>
            <p>One recording. One timeline. Every decision.</p>
          </div>

          <div className={`${styles.storyPanel} ${styles.replay}`}>
            <span className={styles.kicker}>REPLAYING THE DECISION LOOP</span>
            <h2>A transient object appears.</h2>
            <div className={styles.replayFlow}>
              <div><small>SENSED</small><strong>object</strong><span className={styles.eventDot} /></div>
              <b>→</b>
              <div><small>PLANNED</small><strong>trajectory collapses</strong><span className={styles.eventLine} /></div>
              <b>→</b>
              <div><small>COMMANDED</small><strong>stop</strong><span className={styles.stopBlock} /></div>
            </div>
            <p>RobotScope aligns perception and planning at the same timestamp.</p>
          </div>

          <div className={`${styles.storyPanel} ${styles.facts}`}>
            <span className={styles.kicker}>WHAT THE RECORDING PROVES</span>
            <h2><span className={styles.factBadge}>FACTS</span> Observed</h2>
            <article>
              <span>Planned trajectory</span>
              <strong>{trajectory?.observed ?? "0.05 m"}</strong>
              <small>{trajectory?.threshold}</small>
            </article>
            <article>
              <span>Perception objects</span>
              <strong>{perception?.observed ?? "1 low-confidence"}</strong>
              <small>{perception?.threshold}</small>
            </article>
            <code>/robot/ego/planning/trajectory ↔ /robot/ego/perception/objects</code>
          </div>

          <div className={`${styles.storyPanel} ${styles.inference}`}>
            <span className={styles.kicker}>A DEBUGGING LEAD, NOT A GUESS</span>
            <h2><span className={styles.inferenceBadge}>INFERENCE</span></h2>
            <h1>Phantom obstacle<br />stop suspected.</h1>
            <p>{explanation.inference}</p>
            <small>Deterministic heuristic · not a proven root cause</small>
            <div className={styles.cta}>Drop an MCAP. <strong>Explain the stop.</strong></div>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <div className={styles.timelineLabels}>
          <span>QUESTION</span><span>REPLAY</span><span>FACTS</span><span>INFERENCE</span>
        </div>
        <div className={styles.progress}><i style={{ width: `${story.progress * 100}%` }} /></div>
        <span className={styles.license}>Apache-2.0 · fully open core</span>
      </footer>
    </main>
  );
}
