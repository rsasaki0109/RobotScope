import { useEffect, useMemo, useRef } from "react";
import { WebGLRenderer } from "three";

import { laneletOsmToSceneTrajectories } from "@robotscope/core";

import { createRobotSceneController } from "../scene/robot-scene";
import { useViewerStore } from "../store/viewer-store";
import styles from "./SceneView3D.module.css";

export function SceneView3D({ incident = false }: { incident?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<ReturnType<typeof createRobotSceneController> | null>(null);

  const fixedFrame = useViewerStore((s) => s.fixedFrame);
  const session = useViewerStore((s) => s.session);
  const sceneSnapshot = useViewerStore((s) => s.sceneSnapshot);
  const laneletOsmOverlay = useViewerStore((s) => s.laneletOsmOverlay);
  const sceneLoading = useViewerStore((s) => s.sceneLoading);

  const mergedSnapshot = useMemo(() => {
    // Keep the incident replay focused on its planning context. Other demo
    // stacks' occupancy maps and goals obscure this scene.
    if (incident && sceneSnapshot) {
      return {
        ...sceneSnapshot,
        occupancy_grids: [],
        poses: sceneSnapshot.poses.filter((pose) => pose.topic.startsWith("/localization/")),
        trajectories: sceneSnapshot.trajectories.filter((path) =>
          path.topic.startsWith("/planning/") || path.archetype === "Lanelet2",
        ),
      };
    }
    if (!sceneSnapshot || !laneletOsmOverlay) {
      return sceneSnapshot;
    }
    return {
      ...sceneSnapshot,
      trajectories: [
        ...sceneSnapshot.trajectories,
        ...laneletOsmToSceneTrajectories(laneletOsmOverlay),
      ],
    };
  }, [sceneSnapshot, laneletOsmOverlay, incident]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const renderer = new WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const controller = createRobotSceneController(canvas, renderer, { zUp: incident });
    controllerRef.current = controller;

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      controller.resize(width, height);
    };

    resize();

    let frameId = 0;
    const loop = () => {
      controller.render();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      controller.dispose();
      renderer.dispose();
      controllerRef.current = null;
    };
  }, [incident]);

  useEffect(() => {
    controllerRef.current?.updateScene(mergedSnapshot);
  }, [mergedSnapshot]);

  const hudParts = [
    `fixed: ${fixedFrame}`,
    mergedSnapshot
      ? `${mergedSnapshot.tf_frames.length} tf · ${mergedSnapshot.poses.length} pose · ${mergedSnapshot.point_clouds.length} cloud · ${mergedSnapshot.trajectories.length} path`
      : session
        ? "building scene…"
        : "no data",
  ];

  return (
    <div className={styles.view} ref={containerRef} data-scene-ready={Boolean(mergedSnapshot && !sceneLoading)}>
      <canvas ref={canvasRef} className={styles.canvas} />
      {!incident && <div className={styles.overlay}>
        <span>Fixed frame: {fixedFrame}</span>
        <span>{session ? "MCAP loaded" : "No data — open MCAP"}</span>
      </div>}
      {!incident && <div className={styles.hud}>
        {sceneLoading ? "Updating scene…" : hudParts.join(" · ")}
      </div>}
    </div>
  );
}
