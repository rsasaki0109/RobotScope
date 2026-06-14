import { useCallback } from "react";

import { useViewerStore } from "../store/viewer-store";
import styles from "./Sidebar.module.css";
import { TfTreePanel } from "./TfTreePanel";
import { ActionGatewayPanel } from "./ActionGatewayPanel";

export function Sidebar() {
  const topics = useViewerStore((s) => s.topics);
  const selectedTopic = useViewerStore((s) => s.selectedTopic);
  const setSelectedTopic = useViewerStore((s) => s.setSelectedTopic);
  const mappedTopics = useViewerStore((s) => s.mappedTopics);
  const openMcapFile = useViewerStore((s) => s.openMcapFile);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (file?.name.endsWith(".mcap")) {
        await openMcapFile(file);
      }
    },
    [openMcapFile],
  );

  return (
    <aside
      className={styles.sidebar}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <section className={styles.section}>
        <h2>Topics</h2>
        {topics.length === 0 ? (
          <p className={styles.empty}>Drop .mcap here</p>
        ) : (
          <ul className={styles.topicList}>
            {topics.map((topic) => {
              const mapped = mappedTopics.some((m) => m.topic === topic.name);
              return (
              <li key={topic.name}>
                <button
                  type="button"
                  className={
                    selectedTopic === topic.name ? styles.topicActive : styles.topic
                  }
                  onClick={() =>
                    setSelectedTopic(selectedTopic === topic.name ? null : topic.name)
                  }
                >
                  <span className={styles.topicName}>
                    {mapped ? "◆ " : ""}
                    {topic.name}
                  </span>
                  <span className={styles.topicSchema}>{topic.schema}</span>
                </button>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      <TfTreePanel />
      <ActionGatewayPanel />
    </aside>
  );
}
