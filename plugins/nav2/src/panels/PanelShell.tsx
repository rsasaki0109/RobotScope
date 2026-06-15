import type { ReactNode } from "react";

import styles from "./Nav2Panel.module.css";

export type PanelBadgeTone = "ok" | "warn" | "missing";

export function PanelShell({
  title,
  tone,
  label,
  empty,
  emptyMessage,
  children,
}: {
  title: string;
  tone: PanelBadgeTone;
  label: string;
  empty: boolean;
  emptyMessage: string;
  children?: ReactNode;
}) {
  const badgeClass =
    tone === "warn" ? styles.badgeWarn : tone === "missing" ? styles.badgeMissing : styles.badgeOk;

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <span className={badgeClass}>{label}</span>
      </div>
      {empty ? <p className={styles.empty}>{emptyMessage}</p> : children}
    </section>
  );
}
