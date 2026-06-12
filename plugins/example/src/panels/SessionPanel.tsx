import type { ExampleSessionView } from "../types.js";
import styles from "./ExamplePanel.module.css";

export interface SessionPanelProps {
  session: ExampleSessionView | undefined;
}

export function SessionPanel({ session }: SessionPanelProps) {
  if (!session) {
    return (
      <section className={styles.panel}>
        <h3 className={styles.title}>Session</h3>
        <p className={styles.muted}>Open an MCAP or connect live to populate this panel.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <h3 className={styles.title}>Session</h3>
      <dl className={styles.grid}>
        <dt>Source</dt>
        <dd>{session.source}</dd>
        <dt>Topics</dt>
        <dd>{session.topic_count}</dd>
        <dt>Playhead</dt>
        <dd>{session.playhead_s}s</dd>
        <dt>Duration</dt>
        <dd>{session.duration_s}s</dd>
        <dt>/tf</dt>
        <dd>{session.has_tf ? "present" : "missing"}</dd>
        <dt>/odom</dt>
        <dd>{session.has_odom ? "present" : "missing"}</dd>
      </dl>
      {session.sample_topics.length > 0 ? (
        <>
          <p className={styles.caption}>Sample topics</p>
          <ul className={styles.topics}>
            {session.sample_topics.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
