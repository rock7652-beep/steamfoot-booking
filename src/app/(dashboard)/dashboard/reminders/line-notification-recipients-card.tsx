"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createStoreLineNotificationRecipient,
  removeStoreLineNotificationRecipient,
  setStoreLineNotificationRecipientActive,
} from "@/server/actions/store-line-notification-recipients";

type Recipient = {
  id: string;
  displayName: string;
  roleLabel: string;
  isActive: boolean;
  linkedAt: Date | null;
};

const ROLE_OPTIONS = ["店長", "店主", "合夥人", "值班主管"] as const;

export function LineNotificationRecipientsCard({ recipients }: { recipients: Recipient[] }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"店長" | "店主" | "合夥人" | "值班主管">("店長");
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const result = await createStoreLineNotificationRecipient({ displayName: name, roleLabel: role });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setName("");
      window.location.href = result.data.bindUrl;
    });
  }

  return (
    <section className="rounded-xl border border-earth-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-earth-900">LINE 主動通知人員</h2>
      <p className="mt-1 text-xs text-earth-500">
        同店所有啟用人員都會收到 VIP 續購、新體驗預約與數位管家新名單通知。
      </p>
      <div className="mt-4 space-y-2">
        {recipients.length === 0 && <p className="text-sm text-earth-500">尚未綁定通知人員。</p>}
        {recipients.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-earth-100 p-3">
            <div>
              <p className="text-sm font-medium text-earth-900">{item.displayName}・{item.roleLabel}</p>
              <p className="text-xs text-earth-500">{item.linkedAt ? (item.isActive ? "已啟用" : "已暫停") : "等待 LINE 綁定"}</p>
            </div>
            <div className="flex gap-2">
              {item.linkedAt && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(async () => {
                    const result = await setStoreLineNotificationRecipientActive(item.id, !item.isActive);
                    if (result.success) toast.success(item.isActive ? "已暫停通知" : "已啟用通知");
                    else toast.error(result.error);
                  })}
                  className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs"
                >
                  {item.isActive ? "暫停" : "啟用"}
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => {
                  if (!window.confirm(`確定解除 ${item.displayName} 的 LINE 通知綁定？`)) return;
                  const result = await removeStoreLineNotificationRecipient(item.id);
                  if (result.success) toast.success("已解除通知人員");
                  else toast.error(result.error);
                })}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700"
              >
                解除
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
        <input aria-label="通知人員姓名" value={name} onChange={(e) => setName(e.target.value)} placeholder="通知人員姓名" className="rounded-lg border border-earth-200 px-3 py-2 text-sm" />
        <select aria-label="通知人員身分" value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="rounded-lg border border-earth-200 px-3 py-2 text-sm">
          {ROLE_OPTIONS.map((value) => <option key={value}>{value}</option>)}
        </select>
        <button type="button" disabled={pending || !name.trim()} onClick={add} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          綁定我的 LINE
        </button>
      </div>
      <p className="mt-2 text-xs text-earth-500">按下後會開啟該店官方 LINE；傳送已填好的綁定訊息即可完成。</p>
    </section>
  );
}
