import type {ReactNode} from "react";
import styles from "./plan-card-header.module.css";

/** Shared card positions; units, permissions and plan rules stay with each module. */
export function PlanCardHeader({children,summary,actions}:{children:ReactNode;summary:ReactNode;actions?:ReactNode}) {
 return <div role="group" aria-label="方案摘要" className={styles.container}><div className={styles.row}>
  <div className={styles.name}>{children}</div>
  <div className={styles.summary}>{summary}</div>
  {actions&&<div className={styles.actions}>{actions}</div>}
 </div></div>;
}
