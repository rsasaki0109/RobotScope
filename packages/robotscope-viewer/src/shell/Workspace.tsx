import { useEffect } from "react";

import { resolveLiveAgentUrlFromSearch } from "../config/live-agent";
import { useViewerStore } from "../store/viewer-store";
import { CommandBar } from "./CommandBar";
import { PluginRightColumn } from "./PluginRightColumn";
import { SceneView3D } from "./SceneView3D";
import { Sidebar } from "./Sidebar";
import { TimelineBar } from "./TimelineBar";
import styles from "./Workspace.module.css";

function resolveLayoutFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("layout") ?? "default";
}

function shouldAutoLoadDemo(): boolean {
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo");
  return demo === "1" || demo === "true";
}

export function Workspace() {
  const setLayoutId = useViewerStore((s) => s.setLayoutId);
  const openMcapUrl = useViewerStore((s) => s.openMcapUrl);
  const connectLiveAgent = useViewerStore((s) => s.connectLiveAgent);
  const session = useViewerStore((s) => s.session);
  const layoutId = useViewerStore((s) => s.layoutId);

  useEffect(() => {
    setLayoutId(resolveLayoutFromUrl());
  }, [setLayoutId]);

  useEffect(() => {
    if (!shouldAutoLoadDemo() || session) {
      return;
    }
    const demoUrl = `${import.meta.env.BASE_URL}demo/demo-scene.mcap`;
    void openMcapUrl(demoUrl).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      useViewerStore.setState({ statusMessage: `Demo load failed: ${message}` });
    });
  }, [openMcapUrl, session]);

  useEffect(() => {
    if (shouldAutoLoadDemo()) {
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

  return (
    <div className={styles.workspace} data-layout={layoutId}>
      <CommandBar />
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
