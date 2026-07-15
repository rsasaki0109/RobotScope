import { isMcapQueryEngine } from "@robotscope/core";
import { useEffect, useMemo, useState } from "react";

import { explainIncident, type IncidentExplanation } from "../incidents/explain.js";
import {
  findIncidentBySlug,
  groupRecipeMarkers,
  incidentSlug,
  type IncidentRange,
} from "../incidents/model.js";
import { incidentReportMarkdown } from "../incidents/report.js";
import { downloadText } from "../storage/download.js";
import { useViewerStore } from "../store/viewer-store";
import styles from "./IncidentExplainer.module.css";

const STACK_LAYOUT: Record<IncidentRange["stack"], string> = {
  autoware: "autoware",
  nav2: "nav2",
  moveit: "moveit",
};

function requestedIncidentFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("incident") ?? params.get("case");
}

function shouldOpenFromUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("demo") === "incident" || requestedIncidentFromUrl() != null;
}

function relativeTime(ns: number, startNs: number): string {
  return `${((ns - startNs) / 1e9).toFixed(2)}s`;
}

export function IncidentExplainer() {
  const session = useViewerStore((state) => state.session);
  const ingest = useViewerStore((state) => state.ingest);
  const markers = useViewerStore((state) => state.recipeMarkers);
  const indexLoading = useViewerStore((state) => state.recipeIndexLoading);
  const setCurrentTimeNs = useViewerStore((state) => state.setCurrentTimeNs);
  const setLayoutId = useViewerStore((state) => state.setLayoutId);

  const incidents = useMemo(() => groupRecipeMarkers(markers), [markers]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(shouldOpenFromUrl);
  const [explanation, setExplanation] = useState<IncidentExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkStatus, setLinkStatus] = useState("Copy link");

  const selected = incidents.find((incident) => incident.id === selectedId) ?? null;

  useEffect(() => {
    if (incidents.length === 0 || (selectedId && incidents.some((incident) => incident.id === selectedId))) {
      return;
    }
    const requested = findIncidentBySlug(incidents, requestedIncidentFromUrl());
    const next = requested ?? incidents[0];
    if (!next) {
      return;
    }
    setSelectedId(next.id);
    if (requested) {
      setOpen(true);
      setLayoutId(STACK_LAYOUT[next.stack]);
      setCurrentTimeNs(next.start_ns);
    }
  }, [incidents, selectedId, setCurrentTimeNs, setLayoutId]);

  useEffect(() => {
    const engine = ingest?.engine;
    if (!selected || !session || !engine || !isMcapQueryEngine(engine)) {
      setExplanation(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void explainIncident(engine, session, selected.marker)
      .then((result) => {
        if (!cancelled) {
          setExplanation(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExplanation(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ingest, selected, session]);

  if (!session || session.source === "live") {
    return null;
  }

  if (incidents.length === 0) {
    if (!indexLoading || !shouldOpenFromUrl()) {
      return null;
    }
    return <section className={styles.loadingBanner}>Finding incidents and collecting evidence…</section>;
  }

  const chooseIncident = (incident: IncidentRange) => {
    setSelectedId(incident.id);
    setOpen(true);
    setLayoutId(STACK_LAYOUT[incident.stack]);
    setCurrentTimeNs(incident.start_ns);
    const url = new URL(window.location.href);
    url.searchParams.set("layout", STACK_LAYOUT[incident.stack]);
    url.searchParams.set("demo", "incident");
    url.searchParams.set("incident", incidentSlug(incident.recipe_id));
    url.searchParams.delete("case");
    window.history.replaceState({}, "", url);
  };

  if (!open) {
    return (
      <div className={styles.closedBar}>
        <button type="button" className={styles.openButton} onClick={() => setOpen(true)}>
          Explain {incidents.length} detected incident{incidents.length === 1 ? "" : "s"}
        </button>
        <span>Observed facts and heuristic inference stay separate.</span>
      </div>
    );
  }

  const exportReport = () => {
    if (!selected || !explanation) return;
    const report = incidentReportMarkdown(selected, explanation, session);
    downloadText(report, `robotscope-${incidentSlug(selected.recipe_id)}.md`, "text/markdown");
  };

  const copyLink = () => {
    if (!selected) return;
    const url = new URL(window.location.href);
    url.searchParams.set("layout", STACK_LAYOUT[selected.stack]);
    url.searchParams.set("demo", "incident");
    url.searchParams.set("incident", incidentSlug(selected.recipe_id));
    url.searchParams.delete("case");
    void navigator.clipboard.writeText(url.toString()).then(() => {
      setLinkStatus("Copied");
      window.setTimeout(() => setLinkStatus("Copy link"), 1500);
    });
  };

  return (
    <section className={styles.panel} aria-label="Incident Explainer">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>INCIDENT EXPLAINER · deterministic</span>
          <h2>Why did the robot fail?</h2>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={copyLink} disabled={!selected}>{linkStatus}</button>
          <button type="button" onClick={exportReport} disabled={!explanation}>Export .md</button>
          <button type="button" className={styles.closeButton} onClick={() => setOpen(false)} aria-label="Close Incident Explainer">×</button>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.incidentList} aria-label="Detected incidents">
          {incidents.map((incident) => (
            <button
              type="button"
              key={incident.id}
              className={incident.id === selectedId ? styles.incidentActive : styles.incidentButton}
              onClick={() => chooseIncident(incident)}
            >
              <span>{incident.label}</span>
              <small>{incident.stack} · {relativeTime(incident.start_ns, session.start_ns)}</small>
            </button>
          ))}
        </nav>

        <div className={styles.details}>
          {selected ? (
            <>
              <div className={styles.titleRow}>
                <h3>{selected.label}</h3>
                <button type="button" onClick={() => setCurrentTimeNs(selected.start_ns)}>
                  Jump to {relativeTime(selected.start_ns, session.start_ns)}
                </button>
              </div>
              {loading ? <p className={styles.muted}>Collecting evidence at the incident timestamp…</p> : null}
              {explanation ? (
                <div className={styles.evidenceGrid}>
                  <div className={styles.factColumn}>
                    <h4><span className={styles.factBadge}>FACTS</span> Observed in the recording</h4>
                    {explanation.facts.length > 0 ? explanation.facts.map((evidence) => (
                      <article key={`${evidence.entity_path}-${evidence.label}`} className={styles.evidenceCard}>
                        <div><strong>{evidence.label}</strong><span>{evidence.observed}</span></div>
                        {evidence.threshold ? <small>Rule: {evidence.threshold}</small> : null}
                        <code>{evidence.entity_path}</code>
                        {evidence.source ? <small>Topic: {evidence.source}</small> : null}
                      </article>
                    )) : <p className={styles.muted}>No structured evidence was available.</p>}
                  </div>
                  <div className={styles.inferenceColumn}>
                    <h4><span className={styles.inferenceBadge}>INFERENCE</span> Debugging lead</h4>
                    <p>{explanation.inference}</p>
                    <small>Heuristic correlation—not a proven root cause.</small>
                    {explanation.highlight_panels.length > 0 ? (
                      <div className={styles.correlate}>
                        <span>Correlate next</span>
                        {explanation.highlight_panels.map((panel) => <code key={panel}>{panel}</code>)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
