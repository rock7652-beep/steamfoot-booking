import { auditChanges, type AuditReferences } from "@/lib/audit-presentation";

/** Shared by the HQ list and the record's own history dialog. */
export function AuditChanges({ before, after, references, target, targetType }: { before: unknown; after: unknown; references?: AuditReferences; target?: string; targetType?: string }) {
  const changes = auditChanges(before, after, references);
  const sourceNote = target?.includes("（目前資料）") || target?.includes("（目前姓名）") ? `${targetType === "StaffPermission" ? "姓名" : "資料"}來源：目前資料` : null;
  return <>
    {sourceNote && <p className="mb-2 text-sm text-earth-500">{sourceNote}</p>}
    {!changes.length ? <p className="text-sm text-earth-500">{before == null && after == null ? "異動內容未記錄" : "沒有欄位變更"}</p> : <dl className="min-w-0 space-y-2 rounded-lg bg-earth-100 p-3 text-sm text-earth-700">
    {changes.map((change,index)=><div key={index} className="grid min-w-0 gap-1 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3">
      <dt className={change.label ? "break-words text-earth-500" : "sr-only"}>{change.label || "異動內容"}</dt>
      <dd className={`min-w-0 break-words [overflow-wrap:anywhere] ${change.label ? "" : "sm:col-span-2 text-earth-500"}`}>{change.before ? <>{change.before}<span className="px-2 text-earth-500" aria-label="改為">→</span></> : null}{change.after}</dd>
    </div>)}
  </dl>}
  </>;
}
