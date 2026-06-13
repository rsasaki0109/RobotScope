import { useCallback, useState } from "react";

import { parseSidecarManifest } from "@robotscope/core";

import { listLayoutOptions } from "../plugins/registry";
import {
  DEFAULT_LIVE_AGENT_URL,
  LIVE_AGENT_PRESETS,
} from "../config/live-agent";
import { findCompanionSidecarFile } from "../storage/live-recording-download";
import { useViewerStore, type LiveConnectionPhase } from "../store/viewer-store";
import styles from "./CommandBar.module.css";

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
  const openRosbag2Folder = useViewerStore((s) => s.openRosbag2Folder);
  const openLaneletOsmFile = useViewerStore((s) => s.openLaneletOsmFile);
  const clearLaneletOsmOverlay = useViewerStore((s) => s.clearLaneletOsmOverlay);
  const laneletOsmOverlay = useViewerStore((s) => s.laneletOsmOverlay);
  const connectLiveAgent = useViewerStore((s) => s.connectLiveAgent);
  const disconnectLiveAgent = useViewerStore((s) => s.disconnectLiveAgent);
  const startLiveRecording = useViewerStore((s) => s.startLiveRecording);
  const stopLiveRecording = useViewerStore((s) => s.stopLiveRecording);
  const commandGatewayEnabled = useViewerStore((s) => s.commandGatewayEnabled);
  const livePublishTopics = useViewerStore((s) => s.livePublishTopics);
  const cmdVelLinearX = useViewerStore((s) => s.cmdVelLinearX);
  const cmdVelLinearY = useViewerStore((s) => s.cmdVelLinearY);
  const cmdVelLinearZ = useViewerStore((s) => s.cmdVelLinearZ);
  const cmdVelAngularX = useViewerStore((s) => s.cmdVelAngularX);
  const cmdVelAngularY = useViewerStore((s) => s.cmdVelAngularY);
  const cmdVelAngularZ = useViewerStore((s) => s.cmdVelAngularZ);
  const setCommandGatewayEnabled = useViewerStore((s) => s.setCommandGatewayEnabled);
  const setCmdVelTwist = useViewerStore((s) => s.setCmdVelTwist);
  const publishLiveCmdVel = useViewerStore((s) => s.publishLiveCmdVel);
  const publishLiveZeroCmdVel = useViewerStore((s) => s.publishLiveZeroCmdVel);
  const [liveUrl, setLiveUrl] = useState(DEFAULT_LIVE_AGENT_URL);
  const [livePresetId, setLivePresetId] = useState(LIVE_AGENT_PRESETS[0]?.id ?? "custom");

  const onFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files?.length) {
        return;
      }

      const mcapFile = [...files].find(
        (file) => file.name.endsWith(".mcap") || file.name.endsWith(".db3") || file.name.endsWith(".sqlite3"),
      );
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

  const onFolderChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files?.length) {
        return;
      }

      try {
        await openRosbag2Folder(files);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        window.alert(message);
      }
      event.target.value = "";
    },
    [openRosbag2Folder],
  );

  const onOsmChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      try {
        await openLaneletOsmFile(file);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        window.alert(message);
      }
      event.target.value = "";
    },
    [openLaneletOsmFile],
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
  const canPublishCmdVel = livePublishTopics.includes("/cmd_vel");
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
          Open recording
          <input
            type="file"
            accept=".mcap,.db3,.sqlite,.sqlite3,.json,application/json"
            multiple
            hidden
            onChange={onFileChange}
          />
        </label>

        <label className={styles.button}>
          Open bag folder
          <input type="file" multiple hidden onChange={onFolderChange} {...({ webkitdirectory: "" } as const)} />
        </label>

        <label className={styles.button}>
          Load map OSM
          <input type="file" accept=".osm,.xml" hidden onChange={onOsmChange} />
        </label>

        {laneletOsmOverlay ? (
          <button type="button" className={styles.buttonSecondary} onClick={clearLaneletOsmOverlay}>
            Clear OSM
          </button>
        ) : null}

        <div className={styles.liveConnect}>
          <span
            className={`${styles.connectionDot} ${styles[`connection_${connectionPhase}`]}`}
            title={liveConnection.message || connectionLabel}
            aria-label={`Live connection: ${connectionLabel}`}
          />
          <label className={styles.livePreset}>
            <span className={styles.srOnly}>Live agent preset</span>
            <select
              value={livePresetId}
              disabled={isLive}
              onChange={(event) => {
                const preset = LIVE_AGENT_PRESETS.find((entry) => entry.id === event.target.value);
                if (preset) {
                  setLivePresetId(preset.id);
                  setLiveUrl(preset.url);
                } else {
                  setLivePresetId("custom");
                }
              }}
            >
              {LIVE_AGENT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Custom URL</option>
            </select>
          </label>
          <input
            className={styles.liveUrl}
            value={liveUrl}
            onChange={(event) => {
              setLivePresetId("custom");
              setLiveUrl(event.target.value);
            }}
            spellCheck={false}
            aria-label="Live agent WebSocket URL"
            disabled={isLive}
            placeholder="ws://127.0.0.1:8765"
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
            {canPublishCmdVel ? (
              <label className={styles.gatewayToggle}>
                <input
                  type="checkbox"
                  checked={commandGatewayEnabled}
                  onChange={(event) => setCommandGatewayEnabled(event.target.checked)}
                />
                Allow publish
              </label>
            ) : null}
            {commandGatewayEnabled && canPublishCmdVel ? (
              <>
                <div className={styles.cmdVelEditor}>
                  <label className={styles.cmdVelField}>
                    vx
                    <input
                      type="number"
                      step="0.05"
                      value={Number.isFinite(cmdVelLinearX) ? cmdVelLinearX : 0}
                      onChange={(event) =>
                        setCmdVelTwist({ linearX: Number(event.target.value) })
                      }
                      aria-label="Linear velocity x in meters per second"
                    />
                  </label>
                  <label className={styles.cmdVelField}>
                    vy
                    <input
                      type="number"
                      step="0.05"
                      value={Number.isFinite(cmdVelLinearY) ? cmdVelLinearY : 0}
                      onChange={(event) =>
                        setCmdVelTwist({ linearY: Number(event.target.value) })
                      }
                      aria-label="Linear velocity y in meters per second"
                    />
                  </label>
                  <label className={styles.cmdVelField}>
                    vz
                    <input
                      type="number"
                      step="0.05"
                      value={Number.isFinite(cmdVelLinearZ) ? cmdVelLinearZ : 0}
                      onChange={(event) =>
                        setCmdVelTwist({ linearZ: Number(event.target.value) })
                      }
                      aria-label="Linear velocity z in meters per second"
                    />
                  </label>
                  <label className={styles.cmdVelField}>
                    ωx
                    <input
                      type="number"
                      step="0.05"
                      value={Number.isFinite(cmdVelAngularX) ? cmdVelAngularX : 0}
                      onChange={(event) =>
                        setCmdVelTwist({ angularX: Number(event.target.value) })
                      }
                      aria-label="Angular velocity x in radians per second"
                    />
                  </label>
                  <label className={styles.cmdVelField}>
                    ωy
                    <input
                      type="number"
                      step="0.05"
                      value={Number.isFinite(cmdVelAngularY) ? cmdVelAngularY : 0}
                      onChange={(event) =>
                        setCmdVelTwist({ angularY: Number(event.target.value) })
                      }
                      aria-label="Angular velocity y in radians per second"
                    />
                  </label>
                  <label className={styles.cmdVelField}>
                    ωz
                    <input
                      type="number"
                      step="0.05"
                      value={Number.isFinite(cmdVelAngularZ) ? cmdVelAngularZ : 0}
                      onChange={(event) =>
                        setCmdVelTwist({ angularZ: Number(event.target.value) })
                      }
                      aria-label="Angular velocity z in radians per second"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={() => void publishLiveCmdVel()}
                >
                  Publish cmd_vel
                </button>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={() => void publishLiveZeroCmdVel()}
                >
                  Zero cmd_vel
                </button>
              </>
            ) : null}
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
