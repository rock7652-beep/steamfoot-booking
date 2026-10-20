"use client";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";
import { RightSheet } from "@/components/admin/right-sheet";
import { SettingsListRow } from "@/components/settings";
import { BeautyCustomerPanel } from "./customer-panel";
import { BeautyBookingForm } from "./booking-form";
import { BeautyCatalogEditor, type EditorKind } from "./catalog-editor";
import {
  linkBeautyCustomer,
  voidBeautyFee,
  confirmBeautyPurchase,
  changeBeautyStatus,
  collectBeautyPayment,
  purchaseBeautyPlan,
  refundBeautyPayment,
  confirmBeautySettlement,
  payBeautyFee,
  saveBeautyCustomer,
  moveBeautyAppointment,
} from "@/server/actions/beauty";
import { formatTWDateTime } from "@/lib/date-utils";
import type { BeautyDashboardData } from "@/server/beauty/queries";
import type { BeautyTab } from "@/lib/beauty/contracts";
const button =
  "min-h-11 rounded-lg border border-earth-200 bg-white px-3 py-2 text-base disabled:opacity-50";
const field = button + " w-full";
export function BeautyDashboard({
  data,
  tab,
  slug,
  readOnly = false,
}: {
  data: BeautyDashboardData;
  tab: BeautyTab;
  slug: string;
  readOnly?: boolean;
}) {
  const router = useRouter(),
    [pending, start] = useTransition(),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [booking, setBooking] = useState(false),
    [editor, setEditor] = useState<{
      kind: EditorKind;
      draft?: Record<string, unknown>;
    } | null>(null);
  const moneyRequest = useRef(crypto.randomUUID());
  const [moneyPanel, updateMoneyPanel] = useState<{
      kind: "collect" | "refund" | "card" | "fee" | "move" | "void" | "link";
      ids: string[];
    } | null>(null),
    [customerPanel, setCustomerPanel] = useState(false);
  function setMoneyPanel(v: typeof moneyPanel) {
    moneyRequest.current = crypto.randomUUID();
    updateMoneyPanel(v);
  }
  const [detailId, setDetailId] = useState<string | null>(null);
  const [techFilter, setTechFilter] = useState(""),
    [roomFilter, setRoomFilter] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  function run(work: () => Promise<{ success: boolean; error?: string }>) {
    if (pending) return;
    start(async () => {
      setError("");
      try {
        const r = await work();
        if (r.success) {
          setMoneyPanel(null);
          setCustomerPanel(false);
          router.refresh();
        } else setError(r.error ?? "操作失敗");
      } catch {
        setError("連線失敗，請核對後重試");
      }
    });
  }
  const catalog = {
    policy: data.policy,
    services: data.services.filter((s) => s.active),
    techs: data.techs.filter((t) => t.active),
  };
  const appointments = data.items.filter(
    (b) =>
      `${b.personName} ${b.serviceName}`.includes(search) &&
      (!techFilter || b.technicianId === techFilter) &&
      (!roomFilter || b.locationId === roomFilter),
  );
  function status(
    id: string,
    revision: number,
    target: "COMPLETED" | "CANCELLED" | "NO_SHOW" | "RESERVED",
  ) {
    const reason = window.prompt("請填寫操作原因");
    if (reason?.trim())
      run(() =>
        changeBeautyStatus("manager", {
          requestKey: crypto.randomUUID(),
          id,
          revision,
          target,
          reason,
        }),
      );
  }
  const canEditTab =
    (
      {
        位置管理: data.manage.location,
        服務項目: data.manage.plan,
        收費方式: data.manage.plan,
        技師管理: data.manage.technician,
        設定: data.manage.settings,
      } as Record<string, boolean>
    )[tab] ?? false;
  const total = data.payments
    .filter((p) => ["SALE", "REFUND"].includes(p.kind))
    .reduce((n, p) => n + p.amount, 0);
  return (
    <div className="min-w-0 space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={button}
          disabled={pending}
          onClick={() => router.refresh()}
        >
          更新
        </button>
        <label>
          搜尋
          <input
            className={field}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {["首頁", "班表"].includes(tab) && (
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value={tab} />
            <label>
              日期
              <input
                className={field}
                type="date"
                name="date"
                defaultValue={data.date}
              />
            </label>
            <label>
              範圍
              <select
                className={field}
                name="calendar"
                defaultValue={data.calendar}
              >
                <option value="day">當日</option>
                <option value="week">往後一週</option>
                <option value="month">當月</option>
              </select>
            </label>
            <button className={button}>查看</button>
          </form>
        )}
        {!readOnly &&
          data.access.writeAccess &&
          ["首頁", "班表"].includes(tab) && (
            <button className={button} onClick={() => setBooking(true)}>
              新增預約
            </button>
          )}
      </div>
      {tab === "班表" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            技師
            <select
              className={field}
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
            >
              <option value="">全部技師</option>
              {data.techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            位置
            <select
              className={field}
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
            >
              <option value="">全部位置</option>
              {data.locations.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {tab === "首頁" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [
                "今日預約",
                data.items.filter((b) => b.status === "RESERVED").length,
              ],
              [
                "服務完成",
                data.items.filter((b) => b.status === "COMPLETED").length,
              ],
              [
                "取消／未到",
                data.items.filter((b) =>
                  ["CANCELLED", "NO_SHOW"].includes(b.status),
                ).length,
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border p-4">
                <p>{label}</p>
                <strong className="text-2xl">{value}</strong>
              </div>
            ))}
          </div>
          <p>預約、收款、方案與技師服務分開記錄。</p>
        </>
      )}
      {["首頁", "班表"].includes(tab) && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {!readOnly && data.manage.collect && checked.length > 0 && (
              <button
                className={button}
                onClick={() => setMoneyPanel({ kind: "collect", ids: checked })}
              >
                選取服務合併收款（{checked.length}位）
              </button>
            )}
          </div>
          {!appointments.length && <p>此範圍尚無預約。</p>}
          {appointments.map((b) => (
            <article
              key={b.id}
              className="space-y-2 rounded-xl border border-earth-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="checkbox"
                  disabled={
                    !data.manage.collect ||
                    !!b.cardId ||
                    b.status === "CANCELLED"
                  }
                  aria-label={`選取${b.personName}`}
                  checked={checked.includes(b.id)}
                  onChange={(e) =>
                    setChecked((c) =>
                      e.target.checked
                        ? [...c, b.id]
                        : c.filter((id) => id !== b.id),
                    )
                  }
                />
                <strong>
                  {formatTWDateTime(new Date(b.startsAt))}　{b.personName}｜
                  {b.serviceName}
                </strong>
                <span>
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
                </span>
              </div>
              <p>
                {data.techs.find((t) => t.id === b.technicianId)?.name ??
                  "技師"}
                ｜
                {data.locations.find((l) => l.id === b.locationId)?.name ??
                  "位置"}
                ｜結束 {formatTWDateTime(new Date(b.endsAt))}｜
                {b.cardId ? "使用方案1次" : `NT$${b.price}`}
              </p>
              <details>
                <summary className="min-h-11 cursor-pointer py-2">
                  同行與備註
                </summary>
                <p>
                  同組：
                  {data.items
                    .filter((x) => x.groupId === b.groupId)
                    .map((x) => x.personName)
                    .join("、")}
                </p>
                <p>
                  {b.personPhone}　{b.notes || "無本次備註"}
                </p>
              </details>
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  {data.manage.update && b.status === "RESERVED" && (
                    <>
                      <button
                        disabled={pending}
                        className={button}
                        onClick={() => status(b.id, b.revision, "COMPLETED")}
                      >
                        服務完成
                      </button>
                      <button
                        disabled={pending}
                        className={button}
                        onClick={() => status(b.id, b.revision, "NO_SHOW")}
                      >
                        未到
                      </button>
                      <button
                        className={button}
                        onClick={() =>
                          setMoneyPanel({ kind: "move", ids: [b.id] })
                        }
                      >
                        改期／換技師位置
                      </button>
                    </>
                  )}
                  <button
                    disabled={pending || !data.manage.update}
                    className={button}
                    onClick={() =>
                      status(
                        b.id,
                        b.revision,
                        b.status === "CANCELLED" ? "RESERVED" : "CANCELLED",
                      )
                    }
                  >
                    {b.status === "CANCELLED" ? "恢復預約" : "取消"}
                  </button>
                  {b.status !== "RESERVED" && b.status !== "CANCELLED" && (
                    <button
                      className={button}
                      disabled={pending}
                      onClick={() => status(b.id, b.revision, "RESERVED")}
                    >
                      更正回預約
                    </button>
                  )}
                  {!b.customerId &&
                    data.manage.update &&
                    data.access.customerAccess && (
                      <button
                        className={button}
                        onClick={() =>
                          setMoneyPanel({ kind: "link", ids: [b.id] })
                        }
                      >
                        核對並連結顧客
                      </button>
                    )}
                  {data.manage.collect && !b.cardId && (
                    <button
                      className={button}
                      onClick={() =>
                        setMoneyPanel({ kind: "collect", ids: [b.id] })
                      }
                    >
                      收款
                    </button>
                  )}
                  <button
                    disabled={!data.manage.card}
                    className={button}
                    onClick={() =>
                      setMoneyPanel({
                        kind: "card",
                        ids: b.customerId ? [b.customerId] : [],
                      })
                    }
                  >
                    購買方案
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
      {tab === "顧客管理" && (
        <section className="space-y-3">
          {!readOnly && data.manage.customer && (
            <button className={button} onClick={() => setCustomerPanel(true)}>
              新增顧客
            </button>
          )}
          {data.customers
            .filter((c) => `${c.name} ${c.phone}`.includes(search))
            .map((c) => (
              <details className="rounded-xl border p-3" key={c.id}>
                <summary className="min-h-11 cursor-pointer py-2">
                  {c.name}　{c.phone}
                </summary>
                <p>{c.notes}</p>
                <button className={button} onClick={() => setDetailId(c.id)}>
                  顧客資料／服務紀錄／共用成員
                </button>
                {data.cards
                  .filter((k) => k.memberIds.includes(c.id))
                  .map((k) => (
                    <p key={k.id}>
                      {k.name}｜剩餘{k.remaining}次｜已預約{k.held}次｜可用
                      {Math.max(0, k.remaining - k.held)}次
                    </p>
                  ))}
                {!readOnly && data.manage.card && (
                  <button
                    className={button}
                    onClick={() => setMoneyPanel({ kind: "card", ids: [c.id] })}
                  >
                    購買方案
                  </button>
                )}
              </details>
            ))}
        </section>
      )}
      {tab === "顧客經營" && (
        <section>
          <h2 className="font-semibold">低次數／即將到期</h2>
          {data.cards
            .filter(
              (c) =>
                !c.closedAt &&
                (c.remaining - c.held <= 2 ||
                  new Date(c.expiresAt).getTime() < data.now + 14 * 86400000),
            )
            .map((c) => (
              <p className="border-b py-3" key={c.id}>
                {data.customers.find((x) => x.id === c.customerId)?.name}｜
                {c.name}｜剩餘{c.remaining}次｜
                {formatTWDateTime(new Date(c.expiresAt))}到期
              </p>
            ))}
        </section>
      )}
      {tab === "分析" && (
        <form className="flex flex-wrap gap-2">
          <input type="hidden" name="tab" value="分析" />
          <label>
            月份
            <input
              className={field}
              type="month"
              name="month"
              defaultValue={data.month}
            />
          </label>
          <button className={button}>查看</button>
        </form>
      )}
      {tab === "分析" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-xl border p-4">
            <h2>{data.month} 服務</h2>
            {data.analytics.map((r) => (
              <p key={r.serviceName + r.status}>
                {r.serviceName}｜
                {
                  (
                    {
                      RESERVED: "預約",
                      COMPLETED: "完成",
                      CANCELLED: "取消",
                      NO_SHOW: "未到",
                    } as Record<string, string>
                  )[r.status]
                }{" "}
                {r._count.id}人次
              </p>
            ))}
            <p>
              預約人次 {data.analytics.reduce((n, r) => n + r._count.id, 0)}
            </p>
            <p>
              完成{" "}
              {data.analytics
                .filter((r) => r.status === "COMPLETED")
                .reduce((n, r) => n + r._count.id, 0)}
            </p>
          </section>
          {data.access.financeAccess && (
            <section className="rounded-xl border p-4">
              <h2>{data.month} 帳務</h2>
              <p>收款減退款 NT${total}</p>
              <p>依實際收款日，含方案銷售；技師拆帳另計。</p>
            </section>
          )}
          <section className="rounded-xl border p-4">
            <h2>方案</h2>
            <p>
              有效未結清方案{" "}
              {
                data.cards.filter(
                  (c) =>
                    !c.closedAt && new Date(c.expiresAt).getTime() > data.now,
                ).length
              }
              張
            </p>
          </section>
        </div>
      )}
      {tab === "營運" && (
        <section className="space-y-4">
          <form className="flex flex-wrap gap-2">
            <input type="hidden" name="tab" value="營運" />
            <label>
              月份
              <input
                className={field}
                type="month"
                name="month"
                defaultValue={data.month}
              />
            </label>
            <button className={button}>查看</button>
          </form>
          <h2 className="font-semibold">待核帳</h2>
          {data.purchases.map((p) => (
            <div key={p.id} className="flex flex-wrap gap-3 border-b py-3">
              <span>
                {data.customers.find((c) => c.id === p.customerId)?.name}
                ｜後四碼{p.lastFour}
              </span>
              {!readOnly && data.manage.card && (
                <button
                  className={button}
                  onClick={() =>
                    run(() =>
                      confirmBeautyPurchase({
                        id: p.id,
                        requestKey: crypto.randomUUID(),
                      }),
                    )
                  }
                >
                  確認入帳並發方案
                </button>
              )}
            </div>
          ))}
          <h2 className="font-semibold">收款與退款紀錄</h2>
          <div className="flex flex-wrap gap-2">
            <DashboardLink className={button} href="/dashboard/cashbook">
              現金帳
            </DashboardLink>
            <DashboardLink className={button} href="/dashboard/cash-drawer">
              現金抽屜
            </DashboardLink>
          </div>
          {data.payments.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b py-3"
            >
              <span>
                {formatTWDateTime(new Date(p.createdAt))}｜
                {(
                  {
                    SALE: "收款",
                    REFUND: "退款",
                    FEE: "技師付款",
                    FEE_VOID: "拆帳收回",
                  } as Record<string, string>
                )[p.kind] ?? "帳務"}
                ｜NT$
                {p.amount}｜
                {(
                  {
                    CASH: "現金",
                    BANK_TRANSFER: "轉帳",
                    CARD: "刷卡",
                    OTHER: "其他",
                  } as Record<string, string>
                )[p.method] ?? "其他"}
                ｜{p.note}
              </span>
              {p.kind === "FEE" && !readOnly && data.manage.feePay && (
                <button
                  className={button}
                  onClick={() => setMoneyPanel({ kind: "void", ids: [p.id] })}
                >
                  登錄拆帳收回
                </button>
              )}
              {p.kind === "SALE" && !readOnly && data.manage.refund && (
                <button
                  className={button}
                  onClick={() => setMoneyPanel({ kind: "refund", ids: [p.id] })}
                >
                  登錄退款
                </button>
              )}
            </div>
          ))}
          {data.report && (
            <section className="space-y-3">
              <h2 className="font-semibold">技師拆帳月結｜{data.month}</h2>
              <form className="flex gap-2">
                <input type="hidden" name="tab" value="營運" />
                <input
                  className={field}
                  type="month"
                  name="month"
                  defaultValue={data.month}
                />
                <button className={button}>查看</button>
              </form>
              {data.report.lines.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-wrap justify-between gap-2 border-b py-3"
                >
                  <span>
                    {data.techs.find((t) => t.id === l.technicianId)?.name}｜
                    {l.serviceName}｜應付{l.fee}／已付{l.paid}
                  </span>
                  {!readOnly && data.manage.feePay && (
                    <button
                      className={button}
                      onClick={() =>
                        setMoneyPanel({ kind: "fee", ids: [l.id] })
                      }
                    >
                      登錄付款
                    </button>
                  )}
                </div>
              ))}
              {!readOnly && data.manage.feeConfirm && (
                <button
                  disabled={pending}
                  className={button}
                  onClick={() =>
                    run(() =>
                      confirmBeautySettlement({
                        requestKey: crypto.randomUUID(),
                        month: data.month,
                        fingerprint: data.report!.fingerprint,
                      }),
                    )
                  }
                >
                  確認本月拆帳
                </button>
              )}
            </section>
          )}
        </section>
      )}
      {["位置管理", "服務項目", "收費方式", "技師管理"].includes(tab) && (
        <section className="space-y-3">
          {!readOnly && canEditTab && (
            <button
              className={button}
              onClick={() =>
                setEditor({
                  kind: (
                    {
                      位置管理: "location",
                      服務項目: "service",
                      收費方式: "plan",
                      技師管理: "technician",
                    } as Record<string, EditorKind>
                  )[tab],
                })
              }
            >
              新增{tab}
            </button>
          )}
          {(tab === "位置管理"
            ? data.locations
            : tab === "服務項目"
              ? data.services
              : tab === "收費方式"
                ? data.plans
                : data.techs
          )
            .filter((r) => r.name.includes(search))
            .map((r) => (
              <SettingsListRow
                key={r.id}
                title={r.name}
                summary={
                  ("active" in r ? r.active : r.isActive) ? "啟用" : "停用"
                }
                onEdit={
                  readOnly || !canEditTab
                    ? undefined
                    : () =>
                        setEditor({
                          kind: (
                            {
                              位置管理: "location",
                              服務項目: "service",
                              收費方式: "plan",
                              技師管理: "technician",
                            } as Record<string, EditorKind>
                          )[tab],
                          draft: r,
                        })
                }
                expanded={false}
              />
            ))}
        </section>
      )}
      {tab === "設定" && (
        <section className="space-y-3">
          <SettingsListRow
            title="營業與預約規則"
            summary={`自行預約${data.policy.selfBooking ? "開啟" : "關閉"}｜取消${data.policy.cancelDeduct ? "扣次" : "不扣次"}｜未到${data.policy.noShowDeduct ? "扣次" : "不扣次"}`}
            expanded={false}
            onEdit={
              readOnly || !canEditTab
                ? undefined
                : () => setEditor({ kind: "settings" })
            }
          />
          <a
            className={button}
            href={`/beauty-trial/${slug}`}
            target="_blank"
            rel="noreferrer"
          >
            公開體驗表單
          </a>
          <DashboardLink className={button} href="/dashboard/settings/hours">
            營業時間與公休
          </DashboardLink>
          <DashboardLink className={button} href="/dashboard/settings/payment">
            銀行與收款資料
          </DashboardLink>
          <DashboardLink
            className={button}
            href="/dashboard/settings/line-official-accounts"
          >
            LINE 設定
          </DashboardLink>
        </section>
      )}
      {booking && (
        <RightSheet
          open
          presentation="centered"
          width={1000}
          onClose={() => {
            if (window.confirm("確定關閉預約表單？未送出資料將捨棄。"))
              setBooking(false);
          }}
          labelledById="beauty-booking-title"
        >
          <div className="min-h-0 overflow-y-auto p-4">
            <h2 id="beauty-booking-title" className="mb-4 font-semibold">
              新增預約
            </h2>
            <BeautyBookingForm
              catalog={catalog}
              mode="manager"
              slug={slug}
              cards={data.cards.map((c) => ({ ...c, closed: !!c.closedAt }))}
              members={data.customers}
              onBooked={() => router.refresh()}
            />
            <button className={button} onClick={() => setBooking(false)}>
              關閉
            </button>
          </div>
        </RightSheet>
      )}
      {editor && (
        <BeautyCatalogEditor
          kind={editor.kind}
          data={data}
          draft={editor.draft}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            router.refresh();
          }}
        />
      )}
      {detailId && (
        <BeautyCustomerPanel
          id={detailId}
          data={data}
          readOnly={readOnly}
          onClose={() => setDetailId(null)}
        />
      )}
      {customerPanel && (
        <RightSheet
          open
          presentation="centered"
          onClose={() => !pending && setCustomerPanel(false)}
          labelledById="beauty-customer-title"
        >
          <form
            className="space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() =>
                saveBeautyCustomer({
                  name: f.get("name"),
                  phone: f.get("phone"),
                  notes: f.get("notes"),
                }),
              );
            }}
          >
            <h2 id="beauty-customer-title">新增顧客</h2>
            <label>
              姓名
              <input className={field} required name="name" />
            </label>
            <label>
              手機
              <input className={field} required type="tel" name="phone" />
            </label>
            <label>
              備註
              <textarea className={field} name="notes" />
            </label>
            <button className={button} disabled={pending}>
              儲存
            </button>
          </form>
        </RightSheet>
      )}
      {moneyPanel && (
        <RightSheet
          open
          presentation="centered"
          width={700}
          onClose={() => !pending && setMoneyPanel(null)}
          labelledById="beauty-money-title"
        >
          <form
            className="min-h-0 space-y-3 overflow-y-auto p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (pending) return;
              const f = new FormData(e.currentTarget),
                requestKey = moneyRequest.current,
                method = String(f.get("method") ?? "OTHER"),
                note = String(f.get("note") ?? "");
              if (moneyPanel.kind === "link") {
                const b = data.items.find((b) => b.id === moneyPanel.ids[0])!;
                run(() =>
                  linkBeautyCustomer({
                    id: b.id,
                    revision: b.revision,
                    customerId: f.get("customerId"),
                    requestKey,
                  }),
                );
              }
              if (moneyPanel.kind === "collect")
                run(() =>
                  collectBeautyPayment({
                    requestKey,
                    ids: moneyPanel.ids,
                    amounts: moneyPanel.ids.map((id) => Number(f.get(id))),
                    method,
                    note,
                  }),
                );
              if (moneyPanel.kind === "void")
                run(() =>
                  voidBeautyFee({
                    requestKey,
                    paymentId: moneyPanel.ids[0],
                    amount: Number(f.get("amount")),
                    method,
                    reason: note,
                  }),
                );
              if (moneyPanel.kind === "refund")
                run(() =>
                  refundBeautyPayment({
                    requestKey,
                    paymentId: moneyPanel.ids[0],
                    amount: Number(f.get("amount")),
                    method,
                    reason: note,
                  }),
                );
              if (moneyPanel.kind === "card")
                run(() =>
                  purchaseBeautyPlan({
                    requestKey,
                    planId: f.get("planId"),
                    customerId: f.get("customerId"),
                    memberIds: f.getAll("memberIds"),
                    paid: Number(f.get("amount")),
                    method,
                  }),
                );
              if (moneyPanel.kind === "fee")
                run(() =>
                  payBeautyFee({
                    requestKey,
                    id: moneyPanel.ids[0],
                    amount: Number(f.get("amount")),
                    method,
                    note,
                  }),
                );
              if (moneyPanel.kind === "move") {
                const b = data.items.find((b) => b.id === moneyPanel.ids[0])!;
                run(() =>
                  moveBeautyAppointment("manager", {
                    requestKey,
                    id: b.id,
                    revision: b.revision,
                    date: f.get("date"),
                    time: f.get("time"),
                    technicianId: f.get("technicianId") || null,
                    locationId: f.get("locationId") || null,
                    reason: note,
                  }),
                );
              }
            }}
          >
            <h2 id="beauty-money-title">
              {
                {
                  collect: "服務收款",
                  link: "核對並連結顧客（請先確認本人身分）",
                  void: "登錄已收回的拆帳（不執行轉帳）",
                  refund: "登錄退款（不自動退刷）",
                  card: "購買方案",
                  fee: "技師拆帳付款",
                  move: "改期／換技師位置",
                }[moneyPanel.kind]
              }
            </h2>
            {moneyPanel.kind === "collect"
              ? moneyPanel.ids.map((id) => {
                  const b = data.items.find((b) => b.id === id);
                  return (
                    <label className="block" key={id}>
                      {b?.personName}｜{b?.serviceName}
                      <input
                        className={field}
                        type="number"
                        min={0}
                        required
                        name={id}
                        defaultValue={b?.price}
                      />
                    </label>
                  );
                })
              : moneyPanel.kind !== "move" &&
                moneyPanel.kind !== "link" && (
                  <label>
                    金額
                    <input
                      required
                      className={field}
                      type="number"
                      min={0}
                      name="amount"
                    />
                  </label>
                )}
            {moneyPanel.kind === "link" && (
              <label>
                已核對的顧客
                <select className={field} required name="customerId">
                  <option value="">請選擇</option>
                  {data.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}｜{c.phone}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {moneyPanel.kind === "card" && (
              <>
                <label>
                  購買人
                  <select
                    required
                    className={field}
                    name="customerId"
                    defaultValue={moneyPanel.ids[0] ?? ""}
                  >
                    <option value="">請選擇</option>
                    {data.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  方案
                  <select className={field} required name="planId">
                    <option value="">請選擇</option>
                    {data.plans
                      .filter((p) => p.active)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}｜{p.sessions}次｜NT${p.price}
                          {p.allowShared ? "｜可共用" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <fieldset>
                  <legend>具名共用成員（僅允許共用方案）</legend>
                  {data.customers.map((c) => (
                    <label
                      className="flex min-h-11 gap-2 items-center"
                      key={c.id}
                    >
                      <input type="checkbox" name="memberIds" value={c.id} />
                      {c.name}
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            {moneyPanel.kind === "move" && (
              <>
                <label>
                  日期
                  <input
                    type="date"
                    required
                    className={field}
                    name="date"
                    defaultValue={data.date}
                  />
                </label>
                <label>
                  時間
                  <input type="time" required className={field} name="time" />
                </label>
                <label>
                  技師
                  <select className={field} name="technicianId">
                    <option value="">保留偏好，自動安排</option>
                    {data.techs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  位置
                  <select className={field} name="locationId">
                    <option value="">自動安排</option>
                    {data.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {moneyPanel.kind !== "move" && moneyPanel.kind !== "link" && (
              <label>
                付款方式
                <select className={field} name="method">
                  <option value="CASH">現金</option>
                  <option value="BANK_TRANSFER">轉帳</option>
                  <option value="CARD">信用卡</option>
                  <option value="OTHER">其他</option>
                </select>
              </label>
            )}
            <label>
              原因／備註
              <input className={field} required name="note" />
            </label>
            <button className={button} disabled={pending}>
              {pending ? "處理中…" : "確認"}
            </button>
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
          </form>
        </RightSheet>
      )}
    </div>
  );
}
