import type { ReactNode } from "react";
import styles from "./intake-list.module.css";

const columns = ["店家", "聯絡人", "需求", "跟進狀態", "下一步", "原提交時間"];
/** Shared presentation for both phases. Their data and mutations remain separate. */
export function IntakeList({ children }: { children: ReactNode }) {
  return <div className={`${styles.list} rounded-lg border border-earth-200 bg-white`}>
    <div className={styles.head} aria-hidden="true">{columns.map(label => <span key={label}>{label}</span>)}<span /> </div>
    {children}
  </div>;
}
export function IntakeListRow({ store, contact, demand, status, next, submitted, open, children }: {
  store: ReactNode; contact: ReactNode; demand: ReactNode; status: ReactNode; next: ReactNode; submitted: ReactNode;
  open?: boolean; children: ReactNode;
}) {
  const values = [store, contact, demand, status, next, submitted];
  return <details name="hq-intake-record" className={styles.row} open={open || undefined}>
    <summary className={styles.summary}>
      {values.map((value, index) => <span key={columns[index]} className={index === 0 ? styles.store : index === 2 ? styles.demand : undefined}>
        <span className={index === 0 ? "sr-only" : styles.label}>{columns[index]}{index === 0 ? "：" : ""}</span>{value}
      </span>)}
      <span className={styles.more}><span>詳情</span><span className={styles.chevron} aria-hidden="true">›</span></span>
    </summary>
    <div className={`${styles.details} space-y-5`}>{children}</div>
  </details>;
}
