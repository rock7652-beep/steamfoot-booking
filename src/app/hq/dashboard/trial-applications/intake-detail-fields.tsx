import type { ReactNode } from "react";
import { IntakeDisclosure } from "./intake-disclosure";
import styles from "./intake-list.module.css";

/** Missing answers are omitted; explicit false and zero are still answers. */
export function intakeDetailText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (Array.isArray(value)) return value.map(intakeDetailText).filter(text => text !== null).join("、") || null;
  return null;
}

export function IntakeDetailFields({ fields }: { fields: Record<string, unknown> }) {
  const entries = Object.entries(fields).map(([label, value]) => [label, intakeDetailText(value)] as const).filter(([, text]) => text !== null);
  if (!entries.length) return null;
  return <dl className={styles.fields}>{entries.map(([label, text]) =>
    <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl>;
}

export function IntakeSecondaryDetails({ children }: { children: ReactNode }) {
  return <IntakeDisclosure className="border-t text-sm text-earth-600">
    <summary className="min-h-11 cursor-pointer content-center">來源與編號</summary>
    <div className="min-w-0 space-y-2 pb-2 [overflow-wrap:anywhere]">{children}</div>
  </IntakeDisclosure>;
}
