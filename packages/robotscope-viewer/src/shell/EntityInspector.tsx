import type { MappedTopic, RawMessage, TopicInfo } from "@robotscope/core";
import { useViewerStore } from "../store/viewer-store";
import styles from "./EntityInspector.module.css";

function formatTimeNs(ns: number): string {
  if (ns === 0) return "—";
  const sec = ns / 1e9;
  return `${sec.toFixed(3)} s`;
}

function formatPayload(rawMessage: RawMessage | null): string {
  if (!rawMessage) {
    return "No message near cursor time";
  }
  if (rawMessage.decode_error) {
    return `Decode error: ${rawMessage.decode_error}`;
  }
  if (rawMessage.decoded != null) {
    return JSON.stringify(rawMessage.decoded, null, 2);
  }
  return `Binary payload (${rawMessage.data_size} bytes)`;
}

export function EntityInspector() {
  const session = useViewerStore((s) => s.session);
  const selectedTopic = useViewerStore((s) => s.selectedTopic);
  const currentTimeNs = useViewerStore((s) => s.currentTimeNs);
  const fixedFrame = useViewerStore((s) => s.fixedFrame);
  const mappedTopics = useViewerStore((s) => s.mappedTopics);
  const rawMessage = useViewerStore((s) => s.rawMessage);
  const inspectLoading = useViewerStore((s) => s.inspectLoading);

  const selected = session?.topics.find((t: TopicInfo) => t.name === selectedTopic);
  const mapping = mappedTopics.find((m: MappedTopic) => m.topic === selectedTopic);

  return (
    <aside className={styles.inspector}>
      <h2>Inspector</h2>

      <dl className={styles.grid}>
        <dt>Session</dt>
        <dd>{session?.source ?? "none"}</dd>

        <dt>Time cursor</dt>
        <dd>{formatTimeNs(currentTimeNs)}</dd>

        <dt>Fixed frame</dt>
        <dd>{fixedFrame}</dd>

        <dt>Mapped entities</dt>
        <dd>{session?.mapped_entity_count ?? mappedTopics.length}</dd>

        <dt>TF transforms</dt>
        <dd>{session?.tf_transform_count ?? "—"}</dd>

        <dt>Sidecar index</dt>
        <dd>{session?.sidecar_message_count ?? "—"} msgs</dd>
      </dl>

      {selected ? (
        <>
          <section className={styles.section}>
            <h3>Topic</h3>
            <dl className={styles.grid}>
              <dt>Name</dt>
              <dd className={styles.mono}>{selected.name}</dd>
              <dt>Schema</dt>
              <dd className={styles.mono}>{selected.schema}</dd>
              <dt>Messages</dt>
              <dd>{selected.message_count ?? "—"}</dd>
            </dl>
          </section>

          <section className={styles.section}>
            <h3>RDM mapping</h3>
            {mapping ? (
              <dl className={styles.grid}>
                <dt>Entity path</dt>
                <dd className={styles.mono}>{mapping.entity_path}</dd>
                <dt>Archetype</dt>
                <dd>{mapping.archetype}</dd>
                <dt>Rule</dt>
                <dd className={styles.mono}>{mapping.rule_id}</dd>
              </dl>
            ) : (
              <p className={styles.note}>No semantic mapping rule matched this topic yet.</p>
            )}
          </section>

          <section className={styles.section}>
            <h3>Raw message {inspectLoading ? "(loading…)" : ""}</h3>
            <pre className={styles.payload}>{formatPayload(rawMessage)}</pre>
            {rawMessage && (
              <dl className={styles.grid}>
                <dt>Log time</dt>
                <dd>{formatTimeNs(rawMessage.log_time_ns)}</dd>
                <dt>Size</dt>
                <dd>{rawMessage.data_size} B</dd>
              </dl>
            )}
          </section>
        </>
      ) : (
        <p className={styles.note}>Select a topic to inspect provenance, RDM mapping, and decoded payload.</p>
      )}
    </aside>
  );
}
