export const SHOWCASE_DURATION_MS = 10_000;

export type ShowcasePhase = "question" | "replay" | "facts" | "inference";

export interface ShowcaseStoryState {
  elapsed_ms: number;
  phase: ShowcasePhase;
  progress: number;
  incident_time_sec: number;
}

const QUESTION_END_MS = 1_000;
const REPLAY_END_MS = 7_000;
const FACTS_END_MS = 8_500;

export function resolveShowcaseStory(elapsedMs: number, incidentTimeSec = 4.2): ShowcaseStoryState {
  const elapsed_ms = Math.max(0, Math.min(elapsedMs, SHOWCASE_DURATION_MS - 1));
  const phase: ShowcasePhase =
    elapsed_ms < QUESTION_END_MS
      ? "question"
      : elapsed_ms < REPLAY_END_MS
        ? "replay"
        : elapsed_ms < FACTS_END_MS
          ? "facts"
          : "inference";

  const replayProgress = Math.max(
    0,
    Math.min(1, elapsed_ms / REPLAY_END_MS),
  );
  const incident_time_sec = Math.max(0, incidentTimeSec) * replayProgress;

  return {
    elapsed_ms,
    phase,
    progress: elapsed_ms / SHOWCASE_DURATION_MS,
    incident_time_sec,
  };
}

