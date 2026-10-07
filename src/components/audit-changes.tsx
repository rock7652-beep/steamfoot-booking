import { auditChanges, type AuditReferences } from "@/lib/audit-presentation";

/** Shared by the HQ list and the record's own history dialog. */
export function AuditChanges({ before, after, references }: { before: unknown; after: unknown; references?: AuditReferences }) {
  const changes = auditChanges(before, after, references);
  if (!changes.length) return <p className="text-sm text-earth-500">{before == null && after == null ? "這筆紀錄未保存修改前後內容。" : "這筆紀錄沒有可顯示的欄位變更。"}</p>;
  return <dl className="min-w-0 space-y-2 rounded-lg bg-earth-100 p-3 text-sm text-earth-700">
    {changes.map((change,index)=><div key={index} className="grid min-w-0 gap-1 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3">
      <dt className="break-words text-earth-500">{change.label}</dt>
      <dd className="min-w-0 break-words [overflow-wrap:anywhere]"><span className="text-earth-500">異動前：</span>{change.before}<br/><span className="text-earth-500">異動後：</span>{change.after}</dd>
    </div>)}
  </dl>;
}
