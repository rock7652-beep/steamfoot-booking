"use client";
import { useKeyedReminderMutation } from "./reminder-setting-feedback";
import { saveManagerNotification } from "@/lib/manager-notification-save";
import { ManagerNotificationPreview } from "./manager-notification-preview";
import {notificationSwitchClass} from "@/components/admin/notification-switch";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { useState, useTransition, useOptimistic } from "react";
import { toast } from "sonner";
import {
  createStoreLineNotificationRecipient,
  removeStoreLineNotificationRecipient,
} from "@/server/actions/store-line-notification-recipients";
import {
  managerPreferences,
  managerNotificationOptions,
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
function RecipientCard({ item, storeId, onConfirmed, expanded, onExpand, course = false }: { item: Recipient; storeId: string; onConfirmed: (id: string, key: string, enabled: boolean) => void; expanded: boolean; onExpand: () => void; course?: boolean }) {
  const mutation = useKeyedReminderMutation();
  const pending = mutation.pending;
  useSettingsPanelGuard(false, pending);
  const [saved, setSaved] = useState("");
  const [group, setGroup] = useState("預約通知");
  const [display, patch] = useOptimistic(item, (current, change: { key: string; enabled: boolean }) => {
    if (change.key === "active") return { ...current, isActive: change.enabled };
    return { ...current, preferences: { ...managerPreferences(current.preferences, current.sameDayBookingEnabled), [change.key]: change.enabled }, ...(change.key === "sameDay" ? { sameDayBookingEnabled: change.enabled } : {}) };
  });
  const p = managerPreferences(display.preferences, display.sameDayBookingEnabled);
  const options = managerNotificationOptions(course);
  function save(key: string, action: () => Promise<{ success: boolean; error?: string }>, enabled?: boolean) {
    setSaved("");
    const previous = key === "active" ? display.isActive : p[key as keyof typeof p];
    mutation.run(key, action, () => { if (enabled !== undefined) onConfirmed(item.id, key, enabled); setSaved("已儲存"); }, enabled === undefined ? undefined : () => {
      patch({ key, enabled });
      return () => patch({ key, enabled: previous });
    });
  }
  return (
    <article data-notification-recipient className="rounded-xl border border-earth-200 bg-white px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-48">
          <h3 className="break-words font-semibold text-earth-900">{item.displayName}・{item.roleLabel}</h3>
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-earth-500">
            <span>{item.linkedAt ? "LINE 已綁定" : "等待 LINE 綁定"}</span>
            <span>{display.isActive && item.linkedAt ? `已開啟 ${options.filter(option => p[option.key]).length} 項提醒` : !item.linkedAt ? "綁定後可接收" : "已暫停 · 保留設定"}</span>
            {item.legacyStaffId && <span>沿用原負責顧客範圍</span>}
            <span role="status">{pending ? "儲存中…" : saved}</span>
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-1">
          <label className="flex min-h-11 items-center gap-2 px-2 text-sm">
            接收 LINE 通知
            <input aria-label={`${item.displayName} 接收 LINE 通知`} type="checkbox" role="switch"
              checked={display.isActive} disabled={pending || !item.linkedAt}
              onChange={e => { const on = e.target.checked; save("active", () => saveManagerNotification(storeId, item.id, "active", on), on); }}
              className={notificationSwitchClass} />
          </label>
          <button type="button" aria-expanded={expanded} aria-controls={`recipient-${item.id}`} onClick={onExpand} className="min-h-11 rounded-lg px-2 text-sm font-medium text-primary-700">
            {expanded ? "收合設定 ⌃" : "設定提醒 ⌄"}
          </button>
          <details className="relative">
            <summary className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-sm" aria-label={`${item.displayName} 更多操作`}>⋯</summary>
            <button disabled={pending} className="absolute right-0 top-full z-30 min-h-11 whitespace-nowrap rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm text-red-700 shadow-md"
              onClick={() => { if (window.confirm(`確定解除 ${item.displayName} 的 LINE 通知綁定？`)) save("remove", () => removeStoreLineNotificationRecipient(item.id)); }}>解除綁定</button>
          </details>
        </div>
      </div>
      {expanded && <div id={`recipient-${item.id}`} className="mt-3 border-t border-earth-100 pt-3">
        <div
          className={`space-y-3 ${!display.isActive ? "opacity-50" : ""}`}
        >
          <label className="flex flex-wrap items-center gap-3 text-sm"><span>通知分類</span><select aria-label={`${item.displayName} 通知分類`} value={group} onChange={event => setGroup(event.target.value)} className="min-h-11 min-w-0 max-w-full rounded-lg border border-earth-200 bg-white px-3 py-2">{["預約通知", "顧客需求", "店務提醒"].map(value => <option key={value}>{value}</option>)}</select></label>
            <section aria-label={group}>
              <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                {options.filter(
                  (o) => o.group === group,
                ).map((o) => (
                  <label
                    key={o.key}
                    className="flex min-h-11 items-center justify-between gap-3"
                  >
                    <span>
                      <span className="text-sm text-earth-900">{o.label}</span>
                      {mutation.isPending(o.key) && <span role="status" className="ml-2 text-sm text-earth-500">儲存中…</span>}
                      {mutation.errors[o.key] && <span role="alert" className="mt-1 block text-sm text-red-700">{mutation.errors[o.key]}</span>}
                    </span>
                    <input
                      aria-label={`${item.displayName} ${o.label}`}
                      type="checkbox"
                      role="switch"
                      className={notificationSwitchClass}
                      checked={p[o.key]}
                      disabled={mutation.isPending(o.key) || mutation.isPending("active") || mutation.isPending("remove") || !display.isActive || !item.linkedAt}
                      aria-busy={mutation.isPending(o.key)}
                      onChange={(e) => {
                        const on = e.target.checked;
                        save(o.key, () =>
                          saveManagerNotification(storeId, item.id, o.key, on), on,
                        );
                      }}
                    />
                  </label>
                ))}
              </div>
              <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer py-2.5 text-primary-700">查看提醒說明</summary><dl className="space-y-2 text-earth-600">{options.filter(option => option.group === group).map(option => <div key={option.key}><dt className="font-medium">{option.label}</dt><dd>{option.description}</dd></div>)}</dl></details>
            </section>
        </div>
      </div>}
      {(mutation.errors.active || mutation.errors.remove) && <p role="alert" className="mt-2 text-sm text-red-700">{mutation.errors.active || mutation.errors.remove}</p>}
    </article>
  );
}
export function LineNotificationRecipientsCard({
  recipients: initialRecipients,
  storeId,
  course = false,
  bindingUnavailable,
  showHeading = true,
}: {
  recipients: Recipient[];
  storeId: string;
  course?: boolean;
  bindingUnavailable?: string;
  showHeading?: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initialRecipients);
  const [recipients, setRecipients] = useState(initialRecipients);
  if (snapshot !== initialRecipients) { setSnapshot(initialRecipients); setRecipients(initialRecipients); }
  function confirm(id: string, key: string, enabled: boolean) {
    setRecipients(current => current.map(item => item.id !== id ? item : key === "active"
      ? { ...item, isActive: enabled }
      : { ...item, preferences: { ...managerPreferences(item.preferences, item.sameDayBookingEnabled), [key]: enabled }, ...(key === "sameDay" ? { sameDayBookingEnabled: enabled } : {}) }));
  }
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
  useSettingsPanelGuard(!!name.trim(), pending);
  return (
    <section className="space-y-3">
      <ManagerNotificationPreview course={course} />
      {showHeading ? (
        <div>
          <h2 className="text-lg font-semibold text-earth-900">店長 LINE 通知</h2>
          <p className="mt-1 text-sm text-earth-500">
            僅顯示本店通知人員。點選「設定提醒」編輯各自接收的通知。
          </p>
        </div>
      ) : null}
      {recipients.length === 0 && (
        <p className="rounded-lg bg-earth-50 p-3 text-sm text-earth-600">
          尚未綁定通知人員。完成綁定後，即可設定總開關與 {managerNotificationOptions(course).length} 項個別提醒。
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
        {filtered.slice(currentPage * 10, currentPage * 10 + 10).map(item => <RecipientCard storeId={storeId} onConfirmed={confirm} course={course} key={item.id} item={item} expanded={expanded === item.id} onExpand={() => setExpanded(expanded === item.id ? null : item.id)} />)}
        {!filtered.length && <div className="rounded-xl border border-earth-200 bg-white p-5 text-sm text-earth-500">沒有符合條件的人員。<button type="button" onClick={() => { setQuery(""); setStatus("ALL"); setRoleFilter(""); setPage(0); }} className="ml-3 text-primary-700 underline">清除篩選</button></div>}
        {lastPage > 0 && <div className="flex items-center justify-end gap-4 text-sm"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-earth-200 px-3 py-2 disabled:opacity-40">上一頁</button><span>{currentPage + 1} / {lastPage + 1}</span><button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-earth-200 px-3 py-2 disabled:opacity-40">下一頁</button></div>}
      </>}
      {bindingUnavailable ? <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{bindingUnavailable} 完成設定後，請重新整理此頁。</p> : <details
        open={recipients.length === 0}
        className="rounded-xl border border-earth-200 bg-white p-4"
      >
        <summary className="cursor-pointer font-medium text-primary-700">
          ＋ 綁定通知人員
        </summary>
        <p className="mt-3 text-sm text-earth-500">
          填寫姓名後，前往本店官方 LINE 傳送綁定訊息。通知身分不會變更後台權限。
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
            aria-label="通知身分"
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
                try { const r = await createStoreLineNotificationRecipient({
                  displayName: name,
                  roleLabel: role,
                });
                if (r.success) window.location.href = r.data.bindUrl;
                else toast.error(r.error);
                } catch { toast.error("連線未完成，請稍後重試；姓名已保留。"); }
              })
            }
          >
            {pending ? "處理中…" : "綁定我的 LINE"}
          </button>
        </div>
      </details>}
    </section>
  );
}
