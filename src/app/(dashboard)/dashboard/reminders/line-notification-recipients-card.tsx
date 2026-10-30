"use client";
import {ReminderSettingRow,ReminderSettingsList} from "@/components/admin/reminder-settings-list";
import { useKeyedReminderMutation } from "./reminder-setting-feedback";
import { saveManagerNotification } from "@/lib/manager-notification-save";
import { ManagerNotificationPreview } from "./manager-notification-preview";
import {notificationSwitchClass} from "@/components/admin/notification-switch";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { useState, useTransition, useOptimistic } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  createStoreLineNotificationRecipient,
  resumeStoreLineNotificationRecipient,
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
function BindingInstructions({ url }: { url: string }) {
  const parsed = new URL(url);
  const basicId = decodeURIComponent(parsed.pathname.split("/")[3] || "");
  const message = decodeURIComponent(parsed.search.slice(1));
  return <div className="my-3 space-y-2 rounded-lg bg-earth-50 p-4 text-sm" role="status">
    <p>請使用要接收通知的 LINE 帳號，搜尋並加入本店官方帳號 <strong>{basicId}</strong>，再傳送下方訊息。</p>
    <p className="break-all font-medium" tabIndex={0}>{message}</p>
    <button type="button" className="rounded-lg border border-primary-200 px-3 py-2 text-primary-800" onClick={async () => { try { await navigator.clipboard.writeText(message); toast.success("已複製綁定訊息"); } catch { toast.error("無法自動複製，請手動選取上方訊息。"); } }}>複製綁定訊息</button>
    <p>收到綁定成功回覆後，回到此頁重新整理。此訊息只能由本人使用，請勿轉傳。</p>
  </div>;
}
function RecipientCard({ item, storeId, onConfirmed, course = false, beauty = false, readOnly = false }: { item: Recipient; storeId: string; onConfirmed: (id: string, key: string, enabled: boolean) => void; course?: boolean; beauty?:boolean;readOnly?:boolean }) {
  const mutation = useKeyedReminderMutation();
  const [bindingPending,startBinding]=useTransition();
  const [bindingUrl,setBindingUrl]=useState<string | null>(null);
  const pending = mutation.pending||bindingPending;
  useSettingsPanelGuard(false, pending);
  const [saved, setSaved] = useState("");
  const [display, patch] = useOptimistic(item, (current, change: { key: string; enabled: boolean }) => {
    if (change.key === "active") return { ...current, isActive: change.enabled };
    return { ...current, preferences: { ...managerPreferences(current.preferences, current.sameDayBookingEnabled), [change.key]: change.enabled }, ...(change.key === "sameDay" ? { sameDayBookingEnabled: change.enabled } : {}) };
  });
  const p = managerPreferences(display.preferences, display.sameDayBookingEnabled);
  const options = managerNotificationOptions(course,beauty);
  function save(key: string, action: () => Promise<{ success: boolean; error?: string }>, enabled?: boolean) {
    setSaved("");
    const previous = key === "active" ? display.isActive : p[key as keyof typeof p];
    if(readOnly)return;
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
              checked={display.isActive} disabled={readOnly || pending || !item.linkedAt}
              onChange={e => { const on = e.target.checked; save("active", () => saveManagerNotification(storeId, item.id, "active", on), on); }}
              className={notificationSwitchClass} />
          </label>
          {!item.linkedAt&&!readOnly&&<button type="button" disabled={pending} className="min-h-11 rounded-lg border border-primary-200 px-3 text-sm text-primary-800 disabled:opacity-50" onClick={()=>startBinding(async()=>{try{const result=await resumeStoreLineNotificationRecipient(item.id,storeId);if(result.success)setBindingUrl(result.data.bindUrl);else toast.error(result.error);}catch{toast.error("連線未完成，請稍後重試。");}})}>{bindingPending?"開啟中…":"繼續綁定"}</button>}
          {!readOnly&&<details className="relative">
            <summary className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-sm" aria-label={`${item.displayName} 更多操作`}>⋯</summary>
            <button disabled={pending} className="absolute right-0 top-full z-30 min-h-11 whitespace-nowrap rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm text-red-700 shadow-md"
              onClick={() => { if (window.confirm(`確定解除 ${item.displayName} 的 LINE 通知綁定？`)) save("remove", () => removeStoreLineNotificationRecipient(item.id)); }}>解除綁定</button>
          </details>}
        </div>
      </div>
      {!item.linkedAt&&<p className="py-2 text-sm text-earth-600">點選「繼續綁定」取得步驟與綁定訊息；收到綁定成功回覆後，重新整理此頁。</p>}
      {bindingUrl && !item.linkedAt && <BindingInstructions url={bindingUrl}/>}
      <div className="mt-3">
       <ReminderSettingsList label={`${item.displayName} 的通知設定`}>
        {options.map(o=><ReminderSettingRow key={o.key} title={o.label} description={o.description} action="預覽" pending={mutation.isPending(o.key)} error={mutation.errors[o.key]} control={<><span className="text-sm text-earth-500">{mutation.isPending(o.key)?'儲存中…':p[o.key]?'開啟':'關閉'}</span><input aria-label={`${item.displayName} ${o.label}`} type="checkbox" role="switch" className={notificationSwitchClass} checked={p[o.key]} disabled={readOnly||mutation.isPending(o.key)||mutation.isPending('active')||mutation.isPending('remove')||!display.isActive||!item.linkedAt} aria-busy={mutation.isPending(o.key)} onChange={e=>{const on=e.target.checked;save(o.key,()=>saveManagerNotification(storeId,item.id,o.key,on),on);}}/></>}><ManagerNotificationPreview kind={o.key} course={course} beauty={beauty}/></ReminderSettingRow>)}
       </ReminderSettingsList>
      </div>
      {(mutation.errors.active || mutation.errors.remove) && <p role="alert" className="mt-2 text-sm text-red-700">{mutation.errors.active || mutation.errors.remove}</p>}
    </article>
  );
}
export function LineNotificationRecipientsCard({
  recipients: initialRecipients,
  storeId,
  course = false,
  beauty = false,
  bindingUnavailable,
  showHeading = true,
  readOnly = false,
}: {
  recipients: Recipient[];
  storeId: string;
  course?: boolean;
  beauty?: boolean;
  bindingUnavailable?: string;
  showHeading?: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [newBindingUrl, setNewBindingUrl] = useState<string | null>(null);
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

  const filtered = recipients.filter(item =>
    item.displayName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
    (!roleFilter || item.roleLabel === roleFilter) &&
    (status === "ALL" || (status === "WAITING" ? !item.linkedAt : status === "ACTIVE" ? !!item.linkedAt && item.isActive : !!item.linkedAt && !item.isActive)));
  const selectedId=filtered.find(item=>item.id===expanded)?.id??filtered[0]?.id;
  const [name, setName] = useState("");
  const [role, setRole] = useState<"店長" | "店主" | "合夥人" | "值班主管">(
    "店長",
  );
  const [pending, start] = useTransition();
  useSettingsPanelGuard(!!name.trim(), pending);
  return (
    <section className="space-y-3">
      {showHeading ? (
        <div>
          <h2 className="text-lg font-semibold text-earth-900">店長 LINE 通知</h2>
          <p className="mt-1 text-sm text-earth-500">
            {readOnly ? "僅顯示本店通知人員；目前僅供查看既有綁定。" : "先選收件人，再調整這位人員的 LINE 通知。小鈴噹持續接收營運事件。"}
          </p>
        </div>
      ) : null}
      {recipients.length === 0 && (
        <p className="rounded-lg bg-earth-50 p-3 text-sm text-earth-600">
          尚未綁定通知人員。{!readOnly && <>完成綁定後，即可設定總開關與 {managerNotificationOptions(course,beauty).length} 項個別提醒。</>}
        </p>
      )}
      {recipients.length > 0 && <>
        <div className="flex flex-wrap gap-2" aria-label="通知接收狀態">
          {[["ALL", "全部", recipients.length], ["ACTIVE", "接收中", recipients.filter(r => r.linkedAt && r.isActive).length], ["PAUSED", "已暫停", recipients.filter(r => r.linkedAt && !r.isActive).length], ["WAITING", "待綁定", recipients.filter(r => !r.linkedAt).length]].map(([value, label, count]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => { setStatus(String(value)); }} className={`rounded-full border px-3 py-2 text-sm ${status === value ? "border-primary-700 bg-primary-700 text-white" : "border-earth-200 bg-white text-earth-600"}`}>{label} {count}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <input aria-label="搜尋通知人員" placeholder="搜尋姓名" value={query} onChange={e => { setQuery(e.target.value); }} className="min-w-0 flex-1 rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm" />
          <select aria-label="篩選人員身分" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); }} className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm"><option value="">全部身分</option>{Array.from(new Set(recipients.map(r => r.roleLabel))).map(role => <option key={role}>{role}</option>)}</select>
        </div>
        <p className="text-xs text-earth-500" role="status">符合 {filtered.length} 位收件人</p>
        <label className="flex flex-wrap items-center gap-3 text-sm"><span>通知收件人</span><select aria-label="通知收件人" value={selectedId??''} onChange={event=>setExpanded(event.target.value)} className="min-h-11 min-w-0 max-w-full rounded-lg border border-earth-200 bg-white px-3 py-2">{filtered.map(item=><option key={item.id} value={item.id}>{item.displayName}・{item.roleLabel}</option>)}</select></label>
        {recipients.map(item=><div key={item.id} hidden={selectedId!==item.id}><RecipientCard beauty={beauty} readOnly={readOnly} storeId={storeId} onConfirmed={confirm} course={course} item={item}/></div>)}
        {!filtered.length && <div className="rounded-xl border border-earth-200 bg-white p-5 text-sm text-earth-500">沒有符合條件的人員。<button type="button" onClick={() => { setQuery(""); setStatus("ALL"); setRoleFilter(""); }} className="ml-3 text-primary-700 underline">清除篩選</button></div>}

      </>}
      {readOnly ? (bindingUnavailable && <p role="status" className="text-sm text-earth-600">{bindingUnavailable}</p>) : bindingUnavailable ? <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{bindingUnavailable} 完成設定後，請重新整理此頁。</p> : <details
        open={recipients.length === 0}
        className="rounded-xl border border-earth-200 bg-white p-4"
      >
        <summary className="cursor-pointer font-medium text-primary-700">
          ＋ 綁定通知人員
        </summary>
        <p className="mt-3 text-sm text-earth-500">
          填寫姓名後，前往本店官方 LINE 傳送綁定訊息。通知身分不會變更後台權限。
        </p>
        {newBindingUrl && <BindingInstructions url={newBindingUrl}/>}
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
                if (r.success) { setNewBindingUrl(r.data.bindUrl); setName(""); router.refresh(); }
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
