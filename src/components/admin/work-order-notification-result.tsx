"use client";
import { useEffect, useState } from "react";
import { loadWorkOrderNotification } from "@/server/actions/work-order-notification";
import { readyNotificationLabels } from "@/lib/work-order-ready-notification";
import { usePanelReader } from "@/components/operations/panel-read-cache";

export function WorkOrderNotificationResult({ orderId }: { orderId: string }) {
  const [text, setText] = useState("讀取通知結果中…");
  const reader = usePanelReader("work-order-notification", loadWorkOrderNotification, "", 0);
  useEffect(() => {
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => void reader.read(orderId).then(result => {
      if (!active) return;
      if (!result.success) { setText(result.error); return; }
      const event = result.data;
      if (!event) { setText("尚無工單通知紀錄"); return; }
      const at = event.sentAt ?? event.lastAttemptAt;
      setText([readyNotificationLabels[event.status] ?? "需確認", at ? new Date(at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : null, event.errorMessage, event.status === "SENT" ? "不代表已讀或保證送達" : null].filter(Boolean).join("・"));
      if (event.status === "PENDING" && attempts++ < 12) timer = setTimeout(refresh, 5_000);
    }).catch(() => { if (active) setText("目前無法讀取通知結果"); });
    refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [orderId, reader]);
  return <p role="status" className="break-words text-sm text-earth-600">取件通知：{text}</p>;
}
