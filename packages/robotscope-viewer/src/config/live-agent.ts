export const DEFAULT_LIVE_AGENT_URL = "ws://127.0.0.1:8765";

export interface LiveAgentPreset {
  id: string;
  label: string;
  url: string;
}

export const LIVE_AGENT_PRESETS: LiveAgentPreset[] = [
  { id: "local-demo", label: "Local demo :8765", url: DEFAULT_LIVE_AGENT_URL },
];

export function resolveLiveAgentUrlFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  const live = params.get("live");
  if (live === "1" || live === "true") {
    return params.get("liveUrl") ?? DEFAULT_LIVE_AGENT_URL;
  }
  return null;
}
