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
function RecipientCard({ item }: { item: Recipient }) {
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
            className="h-5 w-5 accent-emerald-700"
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
            ? `已開啟 ${Object.values(p).filter(Boolean).length} 項提醒`
            : "已暫停接收 · 保留原設定"}
        </span>
        <span role="status">{pending ? "儲存中…" : saved}</span>
      </div>
      <details className="mt-3 border-t border-earth-100 pt-3">
        <summary className="cursor-pointer text-sm font-medium text-primary-700">
          設定提醒
        </summary>
        <div
          className={`mt-4 grid gap-5 md:grid-cols-3 ${!item.isActive ? "opacity-50" : ""}`}
        >
          {["預約通知", "顧客需求", "店務提醒"].map((group) => (
            <section key={group}>
              <h4 className="mb-3 text-sm font-semibold text-earth-800">
                {group}
              </h4>
              <div className="space-y-4">
                {MANAGER_NOTIFICATION_OPTIONS.filter(
                  (o) => o.group === group,
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
      </details>
    </article>
  );
}
export function LineNotificationRecipientsCard({
  recipients,
}: {
  recipients: Recipient[];
}) {
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
          每位人員獨立設定，關閉總開關即停止接收所有店長通知。
        </p>
      </div>
      {recipients.length === 0 && (
        <p className="rounded-lg bg-earth-50 p-3 text-sm text-earth-600">
          尚未綁定通知人員。完成綁定後，即可設定總開關與 8 項個別提醒。
        </p>
      )}
      {recipients.map((item) => (
        <RecipientCard key={item.id} item={item} />
      ))}
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
