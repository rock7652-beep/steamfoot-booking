"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createStoreLineNotificationRecipient,
  removeStoreLineNotificationRecipient,
  setStoreLineNotificationRecipientActive,
  setManagerNotificationPreference,
} from "@/server/actions/store-line-notification-recipients";
import {
  managerPreferences,
  MANAGER_NOTIFICATION_OPTIONS,
} from "@/lib/manager-notification-preferences";
type Recipient = {
  id: string;
  displayName: string;
  roleLabel: string;
  isActive: boolean;
  linkedAt: Date | null;
  sameDayBookingEnabled: boolean;
  preferences: unknown;
  legacyStaffId?: string | null;
};
function RecipientCard({ item, expanded, onExpand, course = false }: { item: Recipient; expanded: boolean; onExpand: () => void; course?: boolean }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState("");
  const p = managerPreferences(item.preferences, item.sameDayBookingEnabled);
  function save(action: () => Promise<{ success: boolean; error?: string }>) {
    setSaved("");
    start(async () => {
      try {
        const r = await action();
        if (r.success) setSaved("已儲存");
        else toast.error(r.error ?? "儲存失敗");
      } catch {
        toast.error("暫時無法儲存，請再試一次");
      }
    });
  }
  return (
    <article className="rounded-xl border border-earth-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-earth-900">
            {item.displayName}・{item.roleLabel}
          </h3>
          <p className="text-xs text-earth-500">
            {item.linkedAt ? "LINE 已綁定" : "等待 LINE 綁定"}
            {item.legacyStaffId ? " · 沿用原負責顧客範圍" : ""}
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm">
          接收 LINE 通知
          <input
            aria-label={`${item.displayName} 接收 LINE 通知`}
            type="checkbox"
            role="switch"
            checked={item.isActive}
            disabled={pending || !item.linkedAt}
            onChange={(e) => {
              const on = e.target.checked;
              save(() => setStoreLineNotificationRecipientActive(item.id, on));
            }}
            className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-earth-200 p-0.5 transition-colors before:block before:h-5 before:w-5 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:bg-primary-700 checked:before:translate-x-5 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-primary-600"
          />
        </label>
        <details className="relative">
          <summary
            className="cursor-pointer px-3"
            aria-label={`${item.displayName} 更多操作`}
          >
            ⋯
          </summary>
          <button
            disabled={pending}
            className="mt-2 text-sm text-red-700"
            onClick={() => {
              if (
                window.confirm(
                  `確定解除 ${item.displayName} 的 LINE 通知綁定？`,
                )
              )
                save(() => removeStoreLineNotificationRecipient(item.id));
            }}
          >
            解除綁定
          </button>
        </details>
      </div>
      <div className="mt-2 flex justify-between text-xs text-earth-500">
        <span>
          {item.isActive
            && item.linkedAt ? `已開啟 ${Object.values(p).filter(Boolean).length} 項提醒`
            : !item.linkedAt ? "完成 LINE 綁定後才能接收" : "已暫停接收 · 保留原設定"}
        </span>
        <span role="status">{pending ? "儲存中…" : saved}</span>
      </div>
      <button type="button" aria-expanded={expanded} aria-controls={`recipient-${item.id}`} onClick={onExpand} className="mt-2 text-sm font-medium text-primary-700">
        {expanded ? "收合設定 ⌃" : "設定提醒 ⌄"}
      </button>
      {expanded && <div id={`recipient-${item.id}`} className="mt-3 border-t border-earth-100 pt-3">
        <div
          className={`mt-4 grid gap-5 md:grid-cols-3 ${!item.isActive ? "opacity-50" : ""}`}
        >
          {(course ? ["預約通知", "店務提醒"] : ["預約通知", "顧客需求", "店務提醒"]).map((group) => (
            <section key={group}>
              <h4 className="mb-3 text-sm font-semibold text-earth-800">
                {group}
              </h4>
              <div className="space-y-4">
                {MANAGER_NOTIFICATION_OPTIONS.filter(
                  (o) => o.group === group && (!course || o.key === "sameDay" || o.key === "payment"),
                ).map((o) => (
                  <label
                    key={o.key}
                    className="flex items-start justify-between gap-3"
                  >
                    <span>
                      <span className="text-sm text-earth-900">{o.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-earth-500">
                        {o.description}
                      </span>
                    </span>
                    <input
                      aria-label={`${item.displayName} ${o.label}`}
                      type="checkbox"
                      role="switch"
                      className="mt-1 h-5 w-5 shrink-0 accent-emerald-700"
                      checked={p[o.key]}
                      disabled={pending || !item.isActive || !item.linkedAt}
                      onChange={(e) => {
                        const on = e.target.checked;
                        save(() =>
                          setManagerNotificationPreference(item.id, o.key, on),
                        );
                      }}
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>}
    </article>
  );
}
export function LineNotificationRecipientsCard({
  recipients,
  course = false,
}: {
  recipients: Recipient[];
  course?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const filtered = recipients.filter(item =>
    item.displayName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
    (!roleFilter || item.roleLabel === roleFilter) &&
    (status === "ALL" || (status === "WAITING" ? !item.linkedAt : status === "ACTIVE" ? !!item.linkedAt && item.isActive : !!item.linkedAt && !item.isActive)));
  const lastPage = Math.max(0, Math.ceil(filtered.length / 10) - 1);
  const currentPage = Math.min(page, lastPage);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"店長" | "店主" | "合夥人" | "值班主管">(
    "店長",
  );
  const [pending, start] = useTransition();
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-earth-900">店長 LINE 通知</h2>
        <p className="mt-1 text-sm text-earth-500">
          僅顯示本店通知人員。點選「設定提醒」編輯各自接收的通知。
        </p>
      </div>
      {recipients.length === 0 && (
        <p className="rounded-lg bg-earth-50 p-3 text-sm text-earth-600">
          尚未綁定通知人員。完成綁定後，即可設定總開關與 8 項個別提醒。
        </p>
      )}
      {recipients.length > 0 && <>
        <div className="flex flex-wrap gap-2" aria-label="通知接收狀態">
          {[["ALL", "全部", recipients.length], ["ACTIVE", "接收中", recipients.filter(r => r.linkedAt && r.isActive).length], ["PAUSED", "已暫停", recipients.filter(r => r.linkedAt && !r.isActive).length], ["WAITING", "待綁定", recipients.filter(r => !r.linkedAt).length]].map(([value, label, count]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => { setStatus(String(value)); setPage(0); }} className={`rounded-full border px-3 py-2 text-sm ${status === value ? "border-primary-700 bg-primary-700 text-white" : "border-earth-200 bg-white text-earth-600"}`}>{label} {count}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <input aria-label="搜尋通知人員" placeholder="搜尋姓名" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} className="min-w-0 flex-1 rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm" />
          <select aria-label="篩選人員身分" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(0); }} className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm"><option value="">全部身分</option>{Array.from(new Set(recipients.map(r => r.roleLabel))).map(role => <option key={role}>{role}</option>)}</select>
        </div>
        <p className="text-xs text-earth-500" role="status">符合 {filtered.length} 位，每頁最多顯示 10 位</p>
        {filtered.slice(currentPage * 10, currentPage * 10 + 10).map(item => <RecipientCard course={course} key={item.id} item={item} expanded={expanded === item.id} onExpand={() => setExpanded(expanded === item.id ? null : item.id)} />)}
        {!filtered.length && <div className="rounded-xl border border-earth-200 bg-white p-5 text-sm text-earth-500">沒有符合條件的人員。<button type="button" onClick={() => { setQuery(""); setStatus("ALL"); setRoleFilter(""); setPage(0); }} className="ml-3 text-primary-700 underline">清除篩選</button></div>}
        {lastPage > 0 && <div className="flex items-center justify-end gap-4 text-sm"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-earth-200 px-3 py-2 disabled:opacity-40">上一頁</button><span>{currentPage + 1} / {lastPage + 1}</span><button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-earth-200 px-3 py-2 disabled:opacity-40">下一頁</button></div>}
      </>}
      <details
        open={recipients.length === 0}
        className="rounded-xl border border-earth-200 bg-white p-4"
      >
        <summary className="cursor-pointer font-medium text-primary-700">
          ＋ 綁定通知人員
        </summary>
        <p className="mt-3 text-xs text-earth-500">
          填寫姓名後，前往本店官方 LINE 傳送綁定訊息。
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_130px_auto]">
          <input
            aria-label="通知人員姓名"
            placeholder="通知人員姓名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-earth-200 p-2 text-sm"
          />
          <select
            aria-label="通知人員身分"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="rounded-lg border border-earth-200 p-2 text-sm"
          >
            {["店長", "店主", "合夥人", "值班主管"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button
            disabled={pending || !name.trim()}
            className="rounded-lg bg-primary-700 px-4 py-2 text-sm text-white disabled:opacity-50"
            onClick={() =>
              start(async () => {
                const r = await createStoreLineNotificationRecipient({
                  displayName: name,
                  roleLabel: role,
                });
                if (r.success) window.location.href = r.data.bindUrl;
                else toast.error(r.error);
              })
            }
          >
            {pending ? "處理中…" : "綁定我的 LINE"}
          </button>
        </div>
      </details>
    </section>
  );
}
