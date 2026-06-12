import { useEffect } from "react";

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

export function Workspace() {
  const setLayoutId = useViewerStore((s) => s.setLayoutId);
  const layoutId = useViewerStore((s) => s.layoutId);

  useEffect(() => {
    setLayoutId(resolveLayoutFromUrl());
  }, [setLayoutId]);

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
