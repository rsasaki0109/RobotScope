import type {
  IngestHandle,
  IngestProgress,
  MappedTopic,
  RawMessage,
  SceneSnapshot,
  SessionInfo,
  SidecarManifest,
  TfTreeSnapshot,
  TopicInfo,
} from "@robotscope/core";
import { isLiveIngestHandle, isMcapQueryEngine, validateSidecarFingerprint } from "@robotscope/core";
import { create } from "zustand";

import { downloadLiveRecordingBundle } from "../storage/live-recording-download";
import {
  fileFingerprint,
  loadSidecarFromCache,
  saveSidecarToCache,
} from "../storage/sidecar-cache";
import type { RecipeTimelineMarker } from "../failure-recipes/types.js";
import {
  evaluateFailureRecipesAtTime,
  indexFailureRecipeMarkers,
  mergeRecipeMarkers,
} from "../failure-recipes/index-recipes.js";
import { RECIPE_SAMPLE_STEP_NS } from "../failure-recipes/types.js";

export type LiveConnectionPhase =
  | "idle"
  | "connecting"
  | "waiting_for_topics"
  | "streaming"
  | "error"
  | "disconnected";

export interface LiveConnectionState {
  phase: LiveConnectionPhase;
  url: string | null;
  topicsSubscribed: number;
  topicsPending: number;
  message: string;
}

const idleLiveConnection: LiveConnectionState = {
  phase: "idle",
  url: null,
  topicsSubscribed: 0,
  topicsPending: 0,
  message: "",
};

function liveConnectionFromProgress(
  url: string,
  progress: IngestProgress,
): LiveConnectionState {
  const subscribed = progress.topics_subscribed ?? 0;
  const pending = progress.topics_pending ?? 0;
  const message = progress.message ?? progress.phase;

  switch (progress.phase) {
    case "opening":
    case "indexing":
      return {
        phase: "connecting",
        url,
        topicsSubscribed: subscribed,
        topicsPending: pending,
        message,
      };
    case "waiting_for_topics":
      return {
        phase: "waiting_for_topics",
        url,
        topicsSubscribed: subscribed,
        topicsPending: pending,
        message,
      };
    case "ready":
    case "streaming":
      return {
        phase: "streaming",
        url,
        topicsSubscribed: subscribed,
        topicsPending: pending,
        message,
      };
    case "error":
      return {
        phase: "error",
        url,
        topicsSubscribed: subscribed,
        topicsPending: pending,
        message,
      };
    case "disconnected":
      return {
        phase: "disconnected",
        url: null,
        topicsSubscribed: 0,
        topicsPending: 0,
        message,
      };
    default:
      return {
        phase: "connecting",
        url,
        topicsSubscribed: subscribed,
        topicsPending: pending,
        message,
      };
  }
}

function formatLiveStatusMessage(connection: LiveConnectionState): string {
  if (connection.phase === "waiting_for_topics") {
    const pending =
      connection.topicsPending > 0 ? ` · ${connection.topicsPending} pending` : "";
    return `${connection.message} (${connection.topicsSubscribed} subscribed${pending})`;
  }
  return connection.message;
}

export interface ViewerState {
  session: SessionInfo | null;
  ingest: IngestHandle | null;
  topics: TopicInfo[];
  mappedTopics: MappedTopic[];
  tfTree: TfTreeSnapshot | null;
  sceneSnapshot: SceneSnapshot | null;
  rawMessage: RawMessage | null;
  inspectLoading: boolean;
  sceneLoading: boolean;
  currentTimeNs: number;
  isPlaying: boolean;
  playbackRate: number;
  fixedFrame: string;
  selectedTopic: string | null;
  layoutId: string;
  liveFollowing: boolean;
  liveRecording: boolean;
  liveConnection: LiveConnectionState;
  statusMessage: string;
  recipeMarkers: RecipeTimelineMarker[];
  liveActiveRecipes: RecipeTimelineMarker[];
  recipeIndexLoading: boolean;
  openMcapFile: (file: File, options?: { sidecar?: SidecarManifest }) => Promise<void>;
  openMcapUrl: (url: string, options?: { sidecar?: SidecarManifest }) => Promise<void>;
  connectLiveAgent: (url: string) => Promise<void>;
  disconnectLiveAgent: () => Promise<void>;
  startLiveRecording: () => Promise<void>;
  stopLiveRecording: (options?: { reload?: boolean }) => Promise<void>;
  refreshInspection: () => Promise<void>;
  setCurrentTimeNs: (timeNs: number) => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setFixedFrame: (frame: string) => void;
  setSelectedTopic: (topic: string | null) => void;
  setLayoutId: (layoutId: string) => void;
  setLiveFollowing: (following: boolean) => void;
  reset: () => void;
}

const initialState = {
  session: null as SessionInfo | null,
  ingest: null as IngestHandle | null,
  topics: [] as TopicInfo[],
  mappedTopics: [] as MappedTopic[],
  tfTree: null as TfTreeSnapshot | null,
  sceneSnapshot: null as SceneSnapshot | null,
  rawMessage: null as RawMessage | null,
  inspectLoading: false,
  sceneLoading: false,
  currentTimeNs: 0,
  isPlaying: false,
  playbackRate: 1,
  fixedFrame: "map",
  selectedTopic: null as string | null,
  layoutId: "default",
  liveFollowing: true,
  liveRecording: false,
  liveConnection: idleLiveConnection,
  statusMessage: "Drop an MCAP file or connect a live agent",
  recipeMarkers: [] as RecipeTimelineMarker[],
  liveActiveRecipes: [] as RecipeTimelineMarker[],
  recipeIndexLoading: false,
};

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshRequestId = 0;

async function loadFailureRecipeIndex(
  ingest: IngestHandle,
  session: SessionInfo,
  onStatus: (message: string) => void,
): Promise<RecipeTimelineMarker[]> {
  const engine = ingest.engine;
  if (!isMcapQueryEngine(engine) || session.source === "live") {
    return [];
  }

  return indexFailureRecipeMarkers(engine, session, onStatus);
}

async function updateLiveFailureRecipes(
  state: ViewerState,
): Promise<Pick<ViewerState, "recipeMarkers" | "liveActiveRecipes">> {
  const engine = state.ingest?.engine;
  if (!engine || !isMcapQueryEngine(engine) || state.session?.source !== "live") {
    return { recipeMarkers: state.recipeMarkers, liveActiveRecipes: [] };
  }

  const active = await evaluateFailureRecipesAtTime(engine, state.session, state.currentTimeNs);
  const bucket = Math.round(state.currentTimeNs / RECIPE_SAMPLE_STEP_NS) * RECIPE_SAMPLE_STEP_NS;
  const bucketed = active.map((marker) => ({ ...marker, time_ns: bucket }));

  return {
    liveActiveRecipes: active,
    recipeMarkers: mergeRecipeMarkers(state.recipeMarkers, bucketed),
  };
}

async function loadViewerData(state: ViewerState): Promise<Partial<ViewerState>> {
  const engine = state.ingest?.engine;
  if (!engine || !isMcapQueryEngine(engine)) {
    return {
      tfTree: null,
      sceneSnapshot: null,
      rawMessage: null,
      inspectLoading: false,
      sceneLoading: false,
    };
  }

  const [tfTree, rawMessage, sceneSnapshot] = await Promise.all([
    engine.getTfTree(state.currentTimeNs, state.fixedFrame),
    state.selectedTopic
      ? engine.getRawMessageNearTime(state.selectedTopic, state.currentTimeNs)
      : Promise.resolve(null),
    engine.getSceneSnapshot(state.currentTimeNs, {
      fixed_frame: state.fixedFrame,
      include_tf_frames: true,
    }),
  ]);

  return {
    tfTree,
    rawMessage,
    sceneSnapshot,
    inspectLoading: false,
    sceneLoading: false,
    ...(state.session?.source === "live"
      ? await updateLiveFailureRecipes({
          ...state,
          tfTree,
          rawMessage,
          sceneSnapshot,
        })
      : {}),
  };
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  ...initialState,

  async openMcapFile(file, options) {
    set({ statusMessage: `Opening ${file.name}…`, inspectLoading: true, sceneLoading: true });

    const previous = get().ingest;
    if (previous) {
      await previous.close();
    }

    const buffer = await file.arrayBuffer();
    const fingerprint = fileFingerprint(file);
    const cached = options?.sidecar ?? (await loadSidecarFromCache(fingerprint));
    const sidecar =
      cached && validateSidecarFingerprint(cached, fingerprint) ? cached : undefined;

    const { isRosbag2Filename, openMcap, openRosbag2 } = await import("@robotscope/core");
    const isRosbag2 = isRosbag2Filename(file.name);
    const handle = isRosbag2
      ? await openRosbag2(buffer, {
          fingerprint,
          onProgress: (p: IngestProgress) =>
            set({
              statusMessage: p.message ?? `${p.phase}${p.percent != null ? ` (${p.percent}%)` : ""}`,
            }),
        })
      : await openMcap(buffer, {
          sidecar,
          fingerprint,
          onProgress: (p: IngestProgress) =>
            set({
              statusMessage: p.message ?? `${p.phase}${p.percent != null ? ` (${p.percent}%)` : ""}`,
            }),
        });

    if (!isRosbag2 && isMcapQueryEngine(handle.engine)) {
      await saveSidecarToCache(fingerprint, handle.engine.getSidecarManifest());
    }

    const session = await handle.engine.getSessionInfo();
    const bounds = await handle.engine.getTimelineBounds();
    const mappedTopics = isMcapQueryEngine(handle.engine)
      ? handle.engine.getMappedTopics()
      : [];

    const nextState = {
      ingest: handle,
      session,
      topics: session.topics,
      mappedTopics,
      currentTimeNs: bounds.start_ns,
      liveConnection: idleLiveConnection,
      statusMessage: `Loaded ${file.name} (${session.source}) — ${session.topics.length} topics, ${mappedTopics.length} mapped entities, ${session.tf_transform_count ?? 0} TF transforms${session.sidecar_message_count ? " · sidecar" : ""}`,
    };

    set(nextState);
    set(await loadViewerData({ ...get(), ...nextState }));

    void (async () => {
      set({ recipeMarkers: [], liveActiveRecipes: [], recipeIndexLoading: true });
      try {
        const markers = await loadFailureRecipeIndex(handle, session, (message) => {
          set({ statusMessage: message });
        });
        set({
          recipeMarkers: markers,
          recipeIndexLoading: false,
          statusMessage: `Loaded ${file.name} — ${session.topics.length} topics, ${markers.length} failure recipe markers${session.sidecar_message_count ? " · sidecar" : ""}`,
        });
      } catch {
        set({ recipeIndexLoading: false });
      }
    })();
  },

  async openMcapUrl(url, options) {
    set({ statusMessage: `Fetching ${url}…` });
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch MCAP (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    const name = url.split("/").pop() ?? "recording.mcap";
    const file = new File([buffer], name, { type: "application/octet-stream" });
    await get().openMcapFile(file, options);
  },

  async connectLiveAgent(url: string) {
    const trimmedUrl = url.trim();
    set({
      statusMessage: `Connecting to ${trimmedUrl}…`,
      inspectLoading: true,
      sceneLoading: true,
      liveConnection: {
        phase: "connecting",
        url: trimmedUrl,
        topicsSubscribed: 0,
        topicsPending: 0,
        message: `Connecting to ${trimmedUrl}…`,
      },
    });

    const previous = get().ingest;
    if (previous) {
      await previous.close();
    }

    set({ recipeMarkers: [], liveActiveRecipes: [], recipeIndexLoading: false });

    const { openLive } = await import("@robotscope/core");
    const handle = await openLive(trimmedUrl, {
      onProgress: (p: IngestProgress) => {
        const liveConnection = liveConnectionFromProgress(trimmedUrl, p);
        set({
          liveConnection,
          statusMessage: formatLiveStatusMessage(liveConnection),
        });
      },
      onSessionUpdate: (bounds, stats, engine) => {
        if (!isMcapQueryEngine(engine)) {
          return;
        }

        void (async () => {
          const session = await engine.getSessionInfo();
          const mappedTopics = engine.getMappedTopics();
          const state = get();
          const nextTimeNs = state.liveFollowing
            ? bounds.end_ns
            : Math.min(bounds.end_ns, Math.max(bounds.start_ns, state.currentTimeNs));

          const ingest = get().ingest;
          const recordingSuffix =
            state.liveRecording && ingest && isLiveIngestHandle(ingest)
              ? ` · REC ${ingest.getRecordedMessageCount()} msgs`
              : "";

          const liveConnection: LiveConnectionState = {
            ...state.liveConnection,
            phase:
              stats.message_count > 0 || session.topics.length > 0
                ? "streaming"
                : state.liveConnection.phase,
            topicsSubscribed: session.topics.length,
            message:
              stats.message_count > 0 || session.topics.length > 0
                ? `Live · ${stats.message_count} msgs · ${stats.tf_transform_count} TF · ${session.topics.length} topics${recordingSuffix}`
                : state.liveConnection.message,
          };

          set({
            session,
            topics: session.topics,
            mappedTopics,
            currentTimeNs: nextTimeNs,
            liveConnection,
            statusMessage: liveConnection.message,
          });
          set(await loadViewerData({ ...get() }));
        })();
      },
    });

    const session = await handle.engine.getSessionInfo();
    const bounds = await handle.engine.getTimelineBounds();
    const mappedTopics = isMcapQueryEngine(handle.engine)
      ? handle.engine.getMappedTopics()
      : [];

    const connection = get().liveConnection;
    const initialConnection: LiveConnectionState =
      session.topics.length > 0
        ? {
            ...connection,
            phase: "streaming",
            topicsSubscribed: session.topics.length,
            message: `Connected — live agent (${session.topics.length} topics)`,
          }
        : {
            ...connection,
            phase: "waiting_for_topics",
            topicsSubscribed: 0,
            message: connection.message || "Waiting for ROS topics…",
          };

    const nextState = {
      ingest: handle,
      session,
      topics: session.topics,
      mappedTopics,
      currentTimeNs: bounds.end_ns,
      liveFollowing: true,
      liveRecording: false,
      isPlaying: false,
      liveConnection: initialConnection,
      statusMessage: formatLiveStatusMessage(initialConnection),
    };

    set(nextState);
    set(await loadViewerData({ ...get(), ...nextState }));
  },

  async disconnectLiveAgent() {
    const ingest = get().ingest;
    if (ingest) {
      await ingest.close();
    }

    set({
      ingest: null,
      session: null,
      topics: [],
      mappedTopics: [],
      tfTree: null,
      sceneSnapshot: null,
      rawMessage: null,
      liveRecording: false,
      liveFollowing: true,
      liveConnection: {
        phase: "disconnected",
        url: null,
        topicsSubscribed: 0,
        topicsPending: 0,
        message: "Disconnected from live agent",
      },
      statusMessage: "Disconnected from live agent",
      inspectLoading: false,
      sceneLoading: false,
    });
  },

  async startLiveRecording() {
    const ingest = get().ingest;
    if (!ingest || !isLiveIngestHandle(ingest)) {
      set({ statusMessage: "Connect a live agent before recording" });
      return;
    }
    await ingest.startRecording();
    set({
      liveRecording: true,
      statusMessage: "Recording live stream to MCAP…",
    });
  },

  async stopLiveRecording(options: { reload?: boolean } = {}) {
    const reload = options.reload ?? true;
    const ingest = get().ingest;
    if (!ingest || !isLiveIngestHandle(ingest) || !ingest.isRecording()) {
      set({ liveRecording: false });
      return;
    }

    const result = await ingest.stopRecording();
    await downloadLiveRecordingBundle(result);
    set({ liveRecording: false });

    if (reload) {
      await ingest.close();
      const buffer = new ArrayBuffer(result.data.byteLength);
      new Uint8Array(buffer).set(result.data);
      const file = new File([buffer], result.filename, {
        type: "application/octet-stream",
      });
      const fingerprint = fileFingerprint(file);
      const sidecar = {
        ...result.sidecar,
        fingerprint: {
          name: result.filename,
          size: result.data.byteLength,
        },
      };
      await saveSidecarToCache(fingerprint, { ...sidecar, fingerprint });
      await get().openMcapFile(file, { sidecar });
      set({
        statusMessage: `Saved & loaded ${result.filename} + sidecar (${result.message_count} msgs)`,
      });
      return;
    }

    set({
      statusMessage: `Saved ${result.filename} + sidecar JSON (${result.message_count} recorded msgs)`,
    });
  },

  async refreshInspection() {
    const state = get();
    if (!state.ingest) {
      return;
    }

    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    set({ inspectLoading: true, sceneLoading: true });

    refreshTimer = setTimeout(() => {
      const requestId = ++refreshRequestId;
      void (async () => {
        const snapshot = get();
        const result = await loadViewerData(snapshot);
        if (requestId === refreshRequestId) {
          set(result);
        }
      })();
    }, 150);
  },

  setCurrentTimeNs: (timeNs) => {
    const session = get().session;
    if (session?.source === "live") {
      set({ currentTimeNs: timeNs, liveFollowing: false });
    } else {
      set({ currentTimeNs: timeNs });
    }
    void get().refreshInspection();
  },

  setPlaying: (playing) => set({ isPlaying: playing }),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),

  setFixedFrame: (frame) => {
    set({ fixedFrame: frame });
    void get().refreshInspection();
  },

  setSelectedTopic: (topic) => {
    set({ selectedTopic: topic });
    void get().refreshInspection();
  },

  setLayoutId: (layoutId) => set({ layoutId }),
  setLiveFollowing: (following) => {
    set({ liveFollowing: following });
    if (following) {
      const end = get().session?.end_ns;
      if (end != null) {
        set({ currentTimeNs: end });
        void get().refreshInspection();
      }
    }
  },
  reset: () => set({ ...initialState }),
}));
