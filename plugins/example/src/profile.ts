/** Topic hints for the example plugin — first match wins per slot. */
export const EXAMPLE_PROFILE = {
  tf: ["/tf", "/tf_static"],
  odom: ["/odom", "/wheel_odom"],
} as const;

export function resolveExampleTopics(topicNames: string[]) {
  const names = new Set(topicNames);

  function pick(candidates: readonly string[]): string | undefined {
    return candidates.find((topic) => names.has(topic));
  }

  return {
    tf: pick(EXAMPLE_PROFILE.tf),
    odom: pick(EXAMPLE_PROFILE.odom),
  };
}
