import type { ReactNode } from "react";

export const auditListColumns = (showStore: boolean) => showStore
  ? "@[640px]:grid-cols-[96px_130px_minmax(0,1fr)_130px]"
  : "@[720px]:grid-cols-[96px_150px_minmax(0,1fr)]";

/** Each event stays a compact list row, including its useful before/after values. */
export function OperationAuditRow({ id, time, actor, description, storeName }: {
  id: string; time: ReactNode; actor: ReactNode; description: string; storeName?: string;
}) {
  const showStore = storeName !== undefined;
  return <article data-record={id} className={`grid min-h-11 min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3 text-sm ${auditListColumns(showStore)}`}>
    <div className="col-start-1 row-start-1 tabular-nums text-earth-500">{time}</div>
    <div className="col-start-2 row-start-1 min-w-0 break-words text-earth-700">{actor}</div>
    <p className={`col-span-2 col-start-1 row-start-2 min-w-0 break-words py-2 text-earth-900 ${showStore ? "@[640px]:col-span-1 @[640px]:col-start-3 @[640px]:row-start-1" : "@[720px]:col-span-1 @[720px]:col-start-3 @[720px]:row-start-1"}`}>{showStore && <span className="text-earth-500 @[640px]:hidden">{storeName} · </span>}{description}</p>
    {showStore && <p className="hidden min-w-0 break-words text-earth-500 @[640px]:block @[640px]:col-span-1 @[640px]:col-start-4 @[640px]:row-start-1 @[640px]:py-2">{storeName}</p>}
  </article>;
}
