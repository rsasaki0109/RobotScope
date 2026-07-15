import { useEffect } from "react";

import { resolveLiveAgentUrlFromSearch } from "../config/live-agent";
import { useViewerStore } from "../store/viewer-store";
import { CommandBar } from "./CommandBar";
import { CrossLayoutRecipeBanner } from "./CrossLayoutRecipeBanner";
import { IncidentExplainer } from "./IncidentExplainer";
import { PluginRightColumn } from "./PluginRightColumn";
import { SceneView3D } from "./SceneView3D";
import { ShowcaseMode } from "./ShowcaseMode";
import { Sidebar } from "./Sidebar";
import { TimelineBar } from "./TimelineBar";
import styles from "./Workspace.module.css";

function resolveLayoutFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("layout") ?? "default";
}

type DemoSource = "mcap" | "rosbag2";

function resolveDemoSource(): DemoSource | null {
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo");
  if (demo === "1" || demo === "true" || demo === "incident") {
    return "mcap";
  }
  if (demo === "rosbag2") {
    return "rosbag2";
  }
  if (new URLSearchParams(window.location.search).has("showcase")) {
    return "mcap";
  }
  return null;
}

function resolveShowcaseFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("showcase");
}

export function Workspace() {
  const setLayoutId = useViewerStore((s) => s.setLayoutId);
  const openMcapUrl = useViewerStore((s) => s.openMcapUrl);
  const connectLiveAgent = useViewerStore((s) => s.connectLiveAgent);
  const session = useViewerStore((s) => s.session);
  const layoutId = useViewerStore((s) => s.layoutId);
  const showcase = resolveShowcaseFromUrl();

  useEffect(() => {
    setLayoutId(resolveLayoutFromUrl());
  }, [setLayoutId]);

  useEffect(() => {
    const demoSource = resolveDemoSource();
    if (!demoSource || session) {
      return;
    }
    const demoUrl =
      demoSource === "rosbag2"
        ? `${import.meta.env.BASE_URL}demo/demo-rosbag2/demo-rosbag2_0.db3`
        : `${import.meta.env.BASE_URL}demo/demo-scene.mcap`;
    void openMcapUrl(demoUrl).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      useViewerStore.setState({ statusMessage: `Demo load failed: ${message}` });
    });
  }, [openMcapUrl, session]);

  useEffect(() => {
    if (resolveDemoSource()) {
      return;
    }
    const liveUrl = resolveLiveAgentUrlFromSearch(window.location.search);
    if (!liveUrl || session) {
      return;
    }
    void connectLiveAgent(liveUrl).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      useViewerStore.setState({ statusMessage: `Live connect failed: ${message}` });
    });
  }, [connectLiveAgent, session]);

  if (showcase) {
    return <ShowcaseMode incident={showcase} />;
  }

  return (
    <div className={styles.workspace} data-layout={layoutId}>
      <CommandBar />
      <CrossLayoutRecipeBanner />
      <IncidentExplainer />
      <div className={styles.main}>
        <Sidebar />
        <div className={styles.center}>
          <SceneView3D />
          <TimelineBar />
        </div>
        <PluginRightColumn layoutId={layoutId} />
      </div>
    </div>
  );
}
