"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmCoursePurchase } from "@/server/actions/course-portal";
export function CoursePurchaseReview({
  orders,
  canConfirm,
}: {
  orders: {
    id: string;
    name: string;
    customerName: string;
    price: number;
    transferLastFive: string;
  }[];
  canConfirm: boolean;
}) {
  const router = useRouter(),
    [pending, start] = useTransition(),
    [message, setMessage] = useState(""),
    [chosen, setChosen] = useState<string | null>(null);
  if (!orders.length) return null;
  return (
    <section className="rounded-xl border bg-white p-4">
      <h2 className="font-semibold">線上購買待核帳（{orders.length}）</h2>
      {message && <p role="alert">{message}</p>}
      {orders.map((o) => (
        <div
          key={o.id}
          className="flex flex-wrap items-center justify-between gap-3 border-t py-3"
        >
          <div>
            {o.customerName} · {o.name}
            <p className="text-sm">
              NT$ {o.price.toLocaleString()} · 轉帳後四碼 {o.transferLastFive}
            </p>
          </div>
          {canConfirm &&
            (chosen === o.id ? (
              <div className="flex gap-2">
                <button disabled={pending} onClick={() => setChosen(null)}>
                  返回
                </button>
                <button
                  className="min-h-11 rounded-lg bg-primary-700 px-3 text-white"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try {
                        const r = await confirmCoursePurchase({
                          purchaseId: o.id,
                        });
                        if (!r.success) setMessage(r.error ?? "核帳失敗");
                        else {
                          setChosen(null);
                          setMessage("已核帳，方案已啟用");
                          router.refresh();
                        }
                      } catch {
                        setMessage("連線中斷，請重試");
                      }
                    })
                  }
                >
                  確認已收款並啟用
                </button>
              </div>
            ) : (
              <button
                className="min-h-11 rounded-lg border px-3"
                onClick={() => setChosen(o.id)}
              >
                核帳
              </button>
            ))}
        </div>
      ))}
    </section>
  );
}
