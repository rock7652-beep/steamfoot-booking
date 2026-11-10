import { auditChanges, type AuditReferences } from "@/lib/audit-presentation";

/** Shared by the HQ list and the record's own history dialog. */
export function AuditChanges({ before, after, references, target, targetType }: { before: unknown; after: unknown; references?: AuditReferences; target?: string; targetType?: string }) {
  const changes = auditChanges(before, after, references);
  const sourceNote = target?.includes("（目前資料）") || target?.includes("（目前姓名）") ? `${targetType === "StaffPermission" ? "姓名" : "對象名稱"}為目前名稱。` : null;
  const details = changes.filter(change => change.label);
  const incomplete = changes.some(change => !change.label);
  return <>
    {!details.length ? <p className="text-sm text-earth-600">{before == null && after == null || incomplete ? "未保存修改明細" : "無欄位變更"}</p> : <dl className="@container min-w-0 space-y-3 rounded-lg bg-earth-100 p-3 text-sm text-earth-700">
    {details.map((change,index)=><div key={index} className="grid min-w-0 gap-1 @[480px]:grid-cols-[8rem_minmax(0,1fr)] @[480px]:gap-3">
      <dt className={change.label ? "break-words text-earth-500" : "sr-only"}>{change.label || "異動內容"}</dt>
      <dd className="min-w-0 break-words [overflow-wrap:anywhere]">{change.before ? <>{change.before}<span className="px-2 text-earth-500" aria-label="改為">→</span></> : null}{change.after}</dd>
    </div>)}
  </dl>}
    {details.length > 0 && incomplete && <p className="mt-2 text-sm text-earth-500">部分修改明細未保存</p>}
    {sourceNote && <p className="mt-2 text-sm text-earth-500">{sourceNote}</p>}
  </>;
}
