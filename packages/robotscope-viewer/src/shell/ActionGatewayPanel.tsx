import { formatFibonacciSequence } from "@robotscope/core";

import { useViewerStore } from "../store/viewer-store";
import styles from "./ActionGatewayPanel.module.css";

function formatEventKind(kind: string): string {
  return kind.replaceAll("_", " ");
}

export function ActionGatewayPanel() {
  const session = useViewerStore((s) => s.session);
  const liveActionEvents = useViewerStore((s) => s.liveActionEvents);
  const liveActionSendGoalActions = useViewerStore((s) => s.liveActionSendGoalActions);
  const liveActionTracking = useViewerStore((s) => s.liveActionTracking);

  if (session?.source !== "live" || liveActionSendGoalActions.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2>Action timeline</h2>
        <span className={styles.meta}>
          {liveActionTracking?.status ?? "idle"} · {liveActionEvents.length} events
        </span>
      </div>

      {liveActionEvents.length === 0 ? (
        <p className={styles.empty}>
          Send a Fibonacci goal to populate the live action timeline.
        </p>
      ) : (
        <ul className={styles.events}>
          {liveActionEvents.map((event) => (
            <li key={event.id} className={styles.event}>
              <span
                className={styles.kind}
                data-kind={event.kind}
                data-status={event.status}
              >
                {formatEventKind(event.kind)}
              </span>
              <div className={styles.detail}>
                <div>{event.action.split("/").pop() ?? event.action}</div>
                {event.sequence && event.sequence.length > 0 ? (
                  <div className={styles.sequence}>
                    {formatFibonacciSequence(event.sequence)}
                  </div>
                ) : null}
                {event.message ? <div className={styles.message}>{event.message}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
