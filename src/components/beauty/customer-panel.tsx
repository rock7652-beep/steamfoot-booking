"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { createClientReadCache } from "@/lib/client-read-cache";
import { formatTWDateTime } from "@/lib/date-utils";
import {
  readBeautyCustomer,
  updateBeautyCustomer,
  updateBeautyCardMembers,
} from "@/server/actions/beauty";
import type { BeautyDashboardData } from "@/server/beauty/queries";
const field =
  "min-h-11 w-full rounded-lg border border-earth-200 px-3 py-2 text-base";
export function BeautyCustomerPanel({
  id,
  data,
  readOnly,
  onClose,
}: {
  id: string;
  data: BeautyDashboardData;
  readOnly: boolean;
  onClose: () => void;
}) {
  const [reader] = useState(() =>
    createClientReadCache((id: string) => readBeautyCustomer({ id }), {
      ttlMs: 0,
      staleMs: 0,
    }),
  );
  const [detail, setDetail] = useState<Awaited<
      ReturnType<typeof readBeautyCustomer>
    > | null>(null),
    [error, setError] = useState(""),
    [pending, start] = useTransition(),
    router = useRouter();
  useEffect(() => {
    let active = true;
    reader
      .load(id, { revalidate: true })
      .then((r) => {
        if (active) setDetail(r);
      })
      .catch(() => {
        if (active) setError("讀取失敗，請關閉重試");
      });
    return () => {
      active = false;
    };
  }, [reader, id]);
  function run(
    work: () =>
      | ReturnType<typeof updateBeautyCardMembers>
      | ReturnType<typeof updateBeautyCustomer>,
  ) {
    start(async () => {
      try {
        const r = await work();
        if (!r.success) setError(r.error);
        else {
          reader.invalidate(id);
          router.refresh();
          onClose();
        }
      } catch {
        setError("連線失敗，請核對後重試");
      }
    });
  }
  const customer = detail?.success ? detail.data.customer : null;
  return (
    <RightSheet
      open
      presentation="centered"
      width={850}
      onClose={() => !pending && onClose()}
      closeOnEscape={!pending}
      labelledById="beauty-customer-detail"
    >
      <div className="min-h-0 space-y-4 overflow-y-auto p-4">
        <header className="flex items-center justify-between">
          <h2 id="beauty-customer-detail">顧客資料與服務紀錄</h2>
          <button className={field + " !w-auto"} onClick={onClose}>
            關閉
          </button>
        </header>
        {!detail && !error && <p role="status">讀取中…</p>}
        {detail && !detail.success && <p role="alert">{detail.error}</p>}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {customer && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() =>
                updateBeautyCustomer({
                  id,
                  expected: customer,
                  values: {
                    name: f.get("name"),
                    phone: f.get("phone"),
                    notes: f.get("notes"),
                  },
                }),
              );
            }}
          >
            <fieldset
              className="grid gap-3 sm:grid-cols-2"
              disabled={pending || readOnly || !data.manage.customerEdit}
            >
              <label>
                姓名
                <input
                  className={field}
                  required
                  name="name"
                  defaultValue={customer.name}
                />
              </label>
              <label>
                手機
                <input
                  className={field}
                  required
                  pattern="09[0-9]{8}"
                  type="tel"
                  name="phone"
                  defaultValue={customer.phone}
                />
              </label>
              <label className="sm:col-span-2">
                顧客備註
                <textarea
                  className={field}
                  name="notes"
                  defaultValue={customer.notes}
                />
              </label>
              {!readOnly && data.manage.customerEdit && (
                <button className={field}>儲存顧客資料</button>
              )}
            </fieldset>
          </form>
        )}
        {data.cards
          .filter((c) => c.customerId === id && c.allowShared && !c.closedAt)
          .map((c) => (
            <form
              className="space-y-2 rounded-xl border p-3"
              key={c.id}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() =>
                  updateBeautyCardMembers({
                    id: c.id,
                    expected: c.memberIds,
                    memberIds: f.getAll("memberIds"),
                    requestKey: crypto.randomUUID(),
                  }),
                );
              }}
            >
              <h3>{c.name}｜具名共用成員</h3>
              <p>購買人保留在共用成員中；同用一份餘額。</p>
              <fieldset disabled={pending || readOnly || !data.manage.members}>
                {data.customers.map((p) => (
                  <label
                    className="flex min-h-11 items-center gap-2"
                    key={p.id}
                  >
                    <input
                      name="memberIds"
                      type="checkbox"
                      value={p.id}
                      defaultChecked={c.memberIds.includes(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
                {!readOnly && data.manage.members && (
                  <button className={field}>儲存共用成員</button>
                )}
              </fieldset>
            </form>
          ))}
        {detail?.success && (
          <section>
            <h3>最近200筆服務紀錄</h3>
            {!detail.data.items.length && <p>尚無連結會員身分的服務紀錄。</p>}
            {detail.data.items.map((b) => (
              <div className="border-b py-3" key={b.id}>
                <p>
                  {formatTWDateTime(new Date(b.startsAt))}｜{b.serviceName}｜
                  {
                    (
                      {
                        RESERVED: "預約",
                        COMPLETED: "完成",
                        CANCELLED: "取消",
                        NO_SHOW: "未到",
                      } as Record<string, string>
                    )[b.status]
                  }
                </p>
                <p>{b.notes}</p>
              </div>
            ))}
          </section>
        )}
      </div>
    </RightSheet>
  );
}
