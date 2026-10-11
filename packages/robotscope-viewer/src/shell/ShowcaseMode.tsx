import { isMcapQueryEngine } from "@robotscope/core";
import { buildAutowareSnapshot } from "@robotscope/plugin-autoware";
import { useEffect, useMemo, useState } from "react";

import { explainIncident, type IncidentExplanation } from "../incidents/explain.js";
import { findIncidentBySlug, groupRecipeMarkers } from "../incidents/model.js";
import { resolveShowcaseStory, SHOWCASE_DURATION_MS } from "../showcase/story.js";
import { useViewerStore } from "../store/viewer-store";
import { SceneView3D } from "./SceneView3D";
import styles from "./ShowcaseMode.module.css";

const SHOWCASE_ALIASES: Record<string, string> = { "phantom-stop": "phantom-obstacle-stop" };
interface TraceSample { time: number; length: number; objects: number | null; speed: number | null }

export function ShowcaseMode({ incident }: { incident: string }) {
  const session = useViewerStore((state) => state.session);
  const ingest = useViewerStore((state) => state.ingest);
  const markers = useViewerStore((state) => state.recipeMarkers);
  const sceneSnapshot = useViewerStore((state) => state.sceneSnapshot);
  const setCurrentTimeNs = useViewerStore((state) => state.setCurrentTimeNs);
  const setLayoutId = useViewerStore((state) => state.setLayoutId);
  const incidents = useMemo(() => groupRecipeMarkers(markers), [markers]);
  const selected = findIncidentBySlug(incidents, SHOWCASE_ALIASES[incident] ?? incident) ?? null;
  const [explanation, setExplanation] = useState<IncidentExplanation | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [trace, setTrace] = useState<TraceSample[]>([]);
  const incidentElapsed = session && selected ? (selected.start_ns - session.start_ns) / 1e9 : 4.2;
  const story = resolveShowcaseStory(elapsedMs, incidentElapsed);
  const ready = Boolean(session && selected && explanation?.facts.length && trace.length);

  useEffect(() => { if (selected) setLayoutId("autoware"); }, [selected, setLayoutId]);

  useEffect(() => {
    const engine = ingest?.engine;
    setExplanation(null);
    setTrace([]);
    if (!selected || !session || !engine || !isMcapQueryEngine(engine)) return;
    let cancelled = false;
    void (async () => {
      const result = await explainIncident(engine, session, selected.marker);
      const samples = await Promise.all(Array.from({ length: 43 }, async (_, i) => {
        const time = i / 42 * incidentElapsed;
        const snapshot = await buildAutowareSnapshot(engine, session, session.start_ns + Math.round(time * 1e9));
        return {
          time, length: snapshot.planning?.length_m ?? null,
          objects: snapshot.perception?.object_count ?? null,
          speed: snapshot.control?.linear_x_mps ?? null,
        };
      }));
      if (!cancelled) {
        setExplanation(result);
        setTrace(samples.filter((sample): sample is TraceSample => sample.length !== null));
      }
    })();
    return () => { cancelled = true; };
  }, [ingest, selected, session, incidentElapsed]);

  useEffect(() => {
    if (!ready) return;
    const handleCaptureTime = (event: Event) => {
      const next = (event as CustomEvent<number>).detail;
      if (Number.isFinite(next)) setElapsedMs(next);
    };
    window.addEventListener("robotscope:showcase-time", handleCaptureTime);
    if (new URLSearchParams(window.location.search).get("capture") === "1") {
      return () => window.removeEventListener("robotscope:showcase-time", handleCaptureTime);
    }
    const startedAt = performance.now();
    const timer = window.setInterval(() => setElapsedMs((performance.now() - startedAt) % SHOWCASE_DURATION_MS), 40);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("robotscope:showcase-time", handleCaptureTime);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || !session) return;
    const target = session.start_ns + Math.round(story.incident_time_sec * 1e9);
    if (Math.abs(useViewerStore.getState().currentTimeNs - target) >= 10_000_000) setCurrentTimeNs(target);
  }, [ready, session, setCurrentTimeNs, story.incident_time_sec]);

  if (!ready || !session || !selected || !explanation) {
    return <main className={styles.loading} data-showcase-ready="false"><span className={styles.logo}>RS</span><strong>RobotScope</strong><span>Loading robot replay from MCAP…</span></main>;
  }

  const sample = trace.filter((entry) => entry.time <= story.incident_time_sec + 0.000001).at(-1);
  const robotPose = sceneSnapshot?.poses.find((pose) => pose.entity_path === "/robot/ego/localization/pose");
  const stopped = sample?.speed === 0;
  const maxLength = Math.max(1, ...trace.map((entry) => entry.length));
  const chartX = (time: number) => 8 + time / Math.max(incidentElapsed, 0.001) * 264;
  const chartY = (length: number) => 54 - length / maxLength * 38;
  const chartPath = trace.map((entry, i) => `${i ? "H" : "M"}${chartX(entry.time).toFixed(2)}${i ? " V" : ","}${chartY(entry.length).toFixed(2)}`).join(" ");
  const phases = [{ id: "question", label: "DRIVE" }, { id: "replay", label: "REPLAY" }, { id: "facts", label: "STOP" }, { id: "inference", label: "EXPLAIN" }];

  return (
    <main className={styles.showcase} data-showcase-ready="true" data-showcase-phase={story.phase}
      data-showcase-time={story.elapsed_ms} data-robot-x={robotPose?.position[0]} data-robot-y={robotPose?.position[1]}
      data-showcase-scene-ready={Boolean(sceneSnapshot && Math.abs(sceneSnapshot.time_ns - (session.start_ns + Math.round(story.incident_time_sec * 1e9))) < 10_000_000)}
      aria-label="RobotScope robot motion showcase">
      <header className={styles.header}>
        <div className={styles.brand}><span className={styles.logo}>RS</span><div><strong>RobotScope</strong><small>See the robot. Understand its decisions.</small></div></div>
        <div className={styles.headerMeta}><span>Python · MCAP · ROS 2</span><span>LOCAL · OPEN SOURCE</span></div>
      </header>
      <div className={styles.content}>
        <section className={styles.scene} aria-label="Recorded robot motion">
          <SceneView3D incident />
          <div className={styles.sceneShade} />
          <div className={styles.sceneCaption}><span className={styles.liveDot} />ROBOT REPLAY<small>Synthetic MCAP demo · schematic robot</small></div>
          <div className={styles.timecode}><span>LOG TIME</span><strong>{story.incident_time_sec.toFixed(2)}s</strong></div>
          <div className={styles.motionCaption}>
            <span className={styles.motionState} data-stopped={stopped}>{stopped ? "STOP DETECTED" : "FOLLOWING THE PLAN"}</span>
            <h1>{stopped ? <>The robot stopped.<br /><em>Follow the evidence.</em></> : <>Watch the robot move.<br /><em>Every signal, in sync.</em></>}</h1>
            <div className={styles.legend}><span>● Recorded motion</span><span>● Planned path</span><span>● LiDAR returns</span></div>
          </div>
        </section>
        <aside className={styles.telemetry} aria-label="Recorded telemetry">
          <div className={styles.telemetryHeading}><span className={styles.liveDot} />ALIGNED TELEMETRY</div>
          <div className={styles.status} role="status" aria-label={stopped ? "Robot stopped" : "Robot driving"} data-stopped={stopped}>{stopped ? "STOPPED" : "DRIVING"}<span>{stopped ? "Inspect the decision" : "Pose + heading from MCAP"}</span></div>
          <div className={styles.metric}><span>Commanded speed</span><strong>{sample?.speed == null ? "—" : sample.speed.toFixed(2)}<small>m/s</small></strong></div>
          <div className={styles.pose}><span>ROBOT POSITION</span><strong>x {robotPose?.position[0].toFixed(2) ?? "—"}<small>m</small></strong><strong>y {robotPose?.position[1].toFixed(2) ?? "—"}<small>m</small></strong></div>
          <div className={styles.chart}>
            <div><span>Planned trajectory</span><strong>{sample?.length.toFixed(2) ?? "—"} m</strong></div>
            <svg viewBox="0 0 280 72" role="img" aria-label="Planned trajectory length from the MCAP recording">
              <path d="M8 16H272 M8 35H272 M8 54H272" className={styles.chartGrid} />
              <path d={chartPath} className={styles.chartLine} />
              <path d={`M${chartX(story.incident_time_sec)} 10V58`} className={styles.chartCursor} />
              <text x="8" y="71">0.00s</text><text x="272" y="71" textAnchor="end">{incidentElapsed.toFixed(2)}s</text>
            </svg>
          </div>
          <div className={styles.perception}><span>Perception objects</span><strong>{sample?.objects ?? "—"} detected</strong></div>
          <div className={styles.explanation} data-stopped={stopped}>
            {story.phase === "inference" ? <><span className={styles.inferenceBadge}>INFERENCE · HEURISTIC</span><h2>Phantom obstacle suspected.</h2><p>A debugging lead. Not a proven root cause.</p></> : stopped ? <><span className={styles.factBadge}>OBSERVED</span><h2>Plan shortened.<br />Robot stopped.</h2><p>Correlate the object and the plan.</p></> : <><span className={styles.factBadge}>MCAP PLAYBACK</span><h2>Motion. Planning.<br />Perception.</h2><p>One shared timeline.</p></>}
          </div>
        </aside>
      </div>
      <footer className={styles.footer}>
        <div className={styles.timelineLabels}>{phases.map((phase, i) => <span key={phase.id} data-active={story.phase === phase.id}><b>0{i + 1}</b>{phase.label}</span>)}</div>
        <div className={styles.progress}><i style={{ width: `${story.progress * 100}%` }} /></div>
        <span className={styles.license}>Apache-2.0 · fully open core</span>
      </footer>
    </main>
  );
}
