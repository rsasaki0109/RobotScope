import { useEffect, useRef } from "react";
import { WebGLRenderer } from "three";

import { createRobotSceneController } from "../scene/robot-scene";
import { useViewerStore } from "../store/viewer-store";
import styles from "./SceneView3D.module.css";

export function SceneView3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<ReturnType<typeof createRobotSceneController> | null>(null);

  const fixedFrame = useViewerStore((s) => s.fixedFrame);
  const session = useViewerStore((s) => s.session);
  const sceneSnapshot = useViewerStore((s) => s.sceneSnapshot);
  const sceneLoading = useViewerStore((s) => s.sceneLoading);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const renderer = new WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const controller = createRobotSceneController(canvas, renderer);
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
  }, []);

  useEffect(() => {
    controllerRef.current?.updateScene(sceneSnapshot);
  }, [sceneSnapshot]);

  const hudParts = [
    `fixed: ${fixedFrame}`,
    sceneSnapshot
      ? `${sceneSnapshot.tf_frames.length} tf · ${sceneSnapshot.poses.length} pose · ${sceneSnapshot.point_clouds.length} cloud · ${sceneSnapshot.trajectories.length} path`
      : session
        ? "building scene…"
        : "no data",
  ];

  return (
    <div className={styles.view} ref={containerRef}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.overlay}>
        <span>Fixed frame: {fixedFrame}</span>
        <span>{session ? "MCAP loaded" : "No data — open MCAP"}</span>
      </div>
      <div className={styles.hud}>
        {sceneLoading ? "Updating scene…" : hudParts.join(" · ")}
      </div>
    </div>
  );
}
