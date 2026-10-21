"use client";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { StoreImageAnnouncements } from "@/components/image-announcements/carousel";
import { BeautyReschedulePanel } from "./reschedule-panel";
import { BeautyBookingForm } from "./booking-form";
import { requestBeautyPlan, changeBeautyStatus } from "@/server/actions/beauty";
import type { BeautyPortalData } from "@/server/beauty/queries";
import { formatTWDateTime } from "@/lib/date-utils";
const button =
  "min-h-11 rounded-lg border border-earth-200 bg-white px-3 py-2 text-base disabled:opacity-50";
export function BeautyPortal({ data }: { data: BeautyPortalData }) {
  const [reschedule, setReschedule] = useState<
    BeautyPortalData["items"][number] | null
  >(null);
  const purchaseRequests = useRef(new Map<string, string>());
  const [view, setView] = useState("home"),
    [error, setError] = useState(""),
    [pending, start] = useTransition(),
    router = useRouter();
  function change(
    id: string,
    revision: number,
    target: "COMPLETED" | "CANCELLED" | "RESERVED",
  ) {
    const reason = window.prompt("請填寫原因");
    if (!reason) return;
    start(async () => {
      const r = await changeBeautyStatus(data.work ? "work" : "member", {
        id,
        revision,
        target,
        reason,
        requestKey: crypto.randomUUID(),
      });
      if (r.success) router.refresh();
      else setError(r.error);
    });
  }
  const prefix = `/s/${data.store.slug}`;
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-4 bg-earth-50 p-4 text-base">
      <header>
        <h1 className="text-xl font-semibold">{data.store.name}</h1>
        <p>
          {data.work ? "我的工作" : "會員專區"}｜{data.customer?.name}
        </p>
      </header>
      <nav className="flex flex-wrap gap-2">
        {(data.work
          ? [
              ["home", "服務安排"],
              ["income", "我的收入"],
            ]
          : [
              ["home", "我的預約"],
              ["book", "立即預約"],
              ["cards", "我的方案"],
            ]
        ).map(([id, label]) => (
          <button
            className={button}
            aria-pressed={view === id}
            key={id}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
        {(data.work || data.canWork) && (
          <a
            className={button}
            href={`${prefix}/beauty${data.work ? "" : "?work=1"}`}
          >
            {data.work ? "會員專區" : "我的工作"}
          </a>
        )}
        <button
          className={button}
          disabled={pending}
          onClick={() => router.refresh()}
        >
          更新
        </button>
        <a className={button} href={`${prefix}/profile`}>
          個人資料
        </a>
      </nav>
      {!data.work && <StoreImageAnnouncements storeSlug={data.store.slug} />}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {view === "book" && (
        <BeautyBookingForm
          mode="member"
          slug={data.store.slug}
          catalog={data}
          customer={data.customer}
          cards={data.cards}
          members={data.members}
          onBooked={() => router.refresh()}
        />
      )}
      {view === "home" && (
        <section className="space-y-3">
          {!data.items.length && <p>尚無服務預約。</p>}
          {data.items.map((b) => (
            <article
              key={b.id}
              className="space-y-2 rounded-xl border border-earth-200 bg-white p-4"
            >
              <h2 className="font-semibold">
                {b.personName}｜{b.serviceName}
              </h2>
              <p>
                {formatTWDateTime(new Date(b.startsAt))}～
                {formatTWDateTime(new Date(b.endsAt))}
              </p>
              <p>
                技師：
                {data.techs.find((t) => t.id === b.technicianId)?.name ??
                  "店家安排"}
                ｜
                {
                  (
                    {
                      RESERVED: "已預約",
                      COMPLETED: "已完成",
                      CANCELLED: "已取消",
                      NO_SHOW: "未到",
                    } as Record<string, string>
                  )[b.status]
                }
              </p>
              <p>
                方案取消{b.cancelDeduct ? "扣次" : "不扣次"}；未到
                {b.noShowDeduct ? "扣次" : "不扣次"}。
              </p>
              {data.work && b.notes && <p>本次備註：{b.notes}</p>}
              {b.status === "RESERVED" && (
                <div className="flex flex-wrap gap-2">
                  {data.work && data.grants.includes("complete") && (
                    <button
                      className={button}
                      disabled={pending}
                      onClick={() => change(b.id, b.revision, "COMPLETED")}
                    >
                      服務完成
                    </button>
                  )}
                  {(!data.work || data.grants.includes("cancel")) && (
                    <button
                      className={button}
                      disabled={pending}
                      onClick={() => change(b.id, b.revision, "CANCELLED")}
                    >
                      取消預約
                    </button>
                  )}
                  {(!data.work || data.grants.includes("reschedule")) && (
                    <button
                      className={button}
                      disabled={pending}
                      onClick={() => {
                        setReschedule(b);
                      }}
                    >
                      改期
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
      )}
      {view === "cards" && (
        <section className="space-y-3">
          <h2 className="font-semibold">購買方案</h2>
          <p>
            {data.bank?.bankName}　{data.bank?.bankAccountNumber}
          </p>
          {data.plans.map((p) => (
            <div key={p.id} className="flex flex-wrap gap-2 rounded border p-3">
              <span>
                {p.name}｜{p.sessions}次｜NT${p.price}
              </span>
              <button
                className={button}
                disabled={pending}
                onClick={() => {
                  const lastFour = window.prompt("轉帳完成後請填後四碼");
                  if (!lastFour) return;
                  setError("");
                  start(async () => {
                    const key = p.id + lastFour;
                    if (!purchaseRequests.current.has(key))
                      purchaseRequests.current.set(key, crypto.randomUUID());
                    const r = await requestBeautyPlan({
                      planId: p.id,
                      lastFour,
                      requestKey: purchaseRequests.current.get(key)!,
                    });
                    if (r.success) {
                      purchaseRequests.current.delete(key);
                      router.refresh();
                    } else setError(r.error);
                  });
                }}
              >
                已轉帳，送出核帳
              </button>
            </div>
          ))}
          <h2>購買紀錄</h2>
          {data.purchases.map((p) => (
            <p key={p.id}>
              {p.status === "PENDING" ? "待核帳" : "已核帳"}｜
              {formatTWDateTime(new Date(p.createdAt))}
            </p>
          ))}
          <h2>持有方案</h2>
          {!data.cards.length && <p>目前沒有方案，購買請聯絡店家。</p>}
          {data.cards.map((c) => (
            <article key={c.id} className="rounded-xl border bg-white p-4">
              <h2>{c.name}</h2>
              <p>
                剩餘{c.remaining}次｜已預約{c.held}次｜可用
                {c.closed ? 0 : Math.max(0, c.remaining - c.held)}次
              </p>
              <p>
                {formatTWDateTime(new Date(c.expiresAt))}到期
                {c.closed ? "｜已結清" : ""}
              </p>
            </article>
          ))}
        </section>
      )}
      {reschedule && (
        <BeautyReschedulePanel
          mode={data.work ? "work" : "member"}
          item={reschedule}
          onClose={() => setReschedule(null)}
          onSaved={() => {
            setReschedule(null);
            router.refresh();
          }}
        />
      )}
      {view === "income" && (
        <section>
          {!data.grants.includes("income") ? (
            <p>本人收入尚未開放，請洽店長。</p>
          ) : !data.income.length ? (
            <p>本月尚無已確認拆帳。</p>
          ) : (
            data.income.map((l) => (
              <p className="border-b py-3" key={l.id}>
                {l.serviceName}｜應領{l.fee}元｜已付{l.paid}元
              </p>
            ))
          )}
        </section>
      )}
    </main>
  );
}
