import { useCallback, useState } from "react";

import { parseSidecarManifest } from "@robotscope/core";

import { listLayoutOptions } from "../plugins/registry";
import { findCompanionSidecarFile } from "../storage/live-recording-download";
import { useViewerStore, type LiveConnectionPhase } from "../store/viewer-store";
import styles from "./CommandBar.module.css";

const DEFAULT_LIVE_URL = "ws://127.0.0.1:8765";

const CONNECTION_LABELS: Record<LiveConnectionPhase, string> = {
  idle: "Offline",
  connecting: "Connecting",
  waiting_for_topics: "Waiting",
  streaming: "Live",
  error: "Error",
  disconnected: "Offline",
};

export function CommandBar() {
  const statusMessage = useViewerStore((s) => s.statusMessage);
  const layoutId = useViewerStore((s) => s.layoutId);
  const setLayoutId = useViewerStore((s) => s.setLayoutId);
  const layoutOptions = listLayoutOptions();
  const session = useViewerStore((s) => s.session);
  const liveRecording = useViewerStore((s) => s.liveRecording);
  const liveConnection = useViewerStore((s) => s.liveConnection);
  const fixedFrame = useViewerStore((s) => s.fixedFrame);
  const setFixedFrame = useViewerStore((s) => s.setFixedFrame);
  const openMcapFile = useViewerStore((s) => s.openMcapFile);
  const connectLiveAgent = useViewerStore((s) => s.connectLiveAgent);
  const disconnectLiveAgent = useViewerStore((s) => s.disconnectLiveAgent);
  const startLiveRecording = useViewerStore((s) => s.startLiveRecording);
  const stopLiveRecording = useViewerStore((s) => s.stopLiveRecording);
  const [liveUrl, setLiveUrl] = useState(DEFAULT_LIVE_URL);

  const onFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files?.length) {
        return;
      }

      const mcapFile = [...files].find((file) => file.name.endsWith(".mcap"));
      if (!mcapFile) {
        event.target.value = "";
        return;
      }

      const sidecarFile = findCompanionSidecarFile(files, mcapFile);
      let sidecar;
      if (sidecarFile) {
        const raw = await sidecarFile.text();
        sidecar = parseSidecarManifest(raw) ?? undefined;
      }

      await openMcapFile(mcapFile, { sidecar });
      event.target.value = "";
    },
    [openMcapFile],
  );

  const onConnectLive = useCallback(async () => {
    await connectLiveAgent(liveUrl.trim());
  }, [connectLiveAgent, liveUrl]);

  const onDisconnectLive = useCallback(async () => {
    await disconnectLiveAgent();
  }, [disconnectLiveAgent]);

  const onToggleRecording = useCallback(async () => {
    if (liveRecording) {
      await stopLiveRecording({ reload: true });
    } else {
      await startLiveRecording();
    }
  }, [liveRecording, startLiveRecording, stopLiveRecording]);

  const isLive = session?.source === "live";
  const connectionPhase = isLive ? liveConnection.phase : "idle";
  const connectionLabel = CONNECTION_LABELS[connectionPhase];

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.logo}>RobotScope</span>
        <span className={styles.tagline}>Open Observability for Physical AI</span>
      </div>

      <div className={styles.actions}>
        <label className={styles.button}>
          Open MCAP
          <input
            type="file"
            accept=".mcap,.json,application/json"
            multiple
            hidden
            onChange={onFileChange}
          />
        </label>

        <div className={styles.liveConnect}>
          <span
            className={`${styles.connectionDot} ${styles[`connection_${connectionPhase}`]}`}
            title={liveConnection.message || connectionLabel}
            aria-label={`Live connection: ${connectionLabel}`}
          />
          <input
            className={styles.liveUrl}
            value={liveUrl}
            onChange={(event) => setLiveUrl(event.target.value)}
            spellCheck={false}
            aria-label="Live agent WebSocket URL"
            disabled={isLive}
          />
          {isLive ? (
            <button type="button" className={styles.buttonSecondary} onClick={onDisconnectLive}>
              Disconnect
            </button>
          ) : (
            <button type="button" className={styles.buttonSecondary} onClick={onConnectLive}>
              Connect Live
            </button>
          )}
        </div>

        {isLive ? (
          <>
            <button
              type="button"
              className={liveRecording ? styles.recordActive : styles.recordButton}
              onClick={onToggleRecording}
            >
              {liveRecording ? "Stop & Save MCAP" : "Record Live"}
            </button>
            <span className={styles.liveBadge} data-phase={connectionPhase}>
              {liveRecording ? "REC" : connectionLabel.toUpperCase()}
            </span>
          </>
        ) : null}

        <label className={styles.layoutSelect}>
          Layout
          <select
            value={layoutId}
            onChange={(event) => {
              const next = event.target.value;
              setLayoutId(next);
              const url = new URL(window.location.href);
              if (next === "default") {
                url.searchParams.delete("layout");
              } else {
                url.searchParams.set("layout", next);
              }
              window.history.replaceState({}, "", url);
            }}
          >
            {layoutOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.frameSelect}>
          Fixed frame
          <input
            value={fixedFrame}
            onChange={(e) => setFixedFrame(e.target.value)}
            spellCheck={false}
          />
        </label>
      </div>

      <p className={styles.status}>{statusMessage}</p>
    </header>
  );
}
