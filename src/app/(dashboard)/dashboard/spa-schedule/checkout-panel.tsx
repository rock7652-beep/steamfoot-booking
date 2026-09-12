"use client";
import {
  SPA_CHECKOUT_PAYMENT_METHODS,
  SPA_PAYMENT_LABELS,
  SPA_COLLECTION_HINTS,
  isSpaExternalPayment,
  type SpaCheckoutPaymentMethod,
} from "@/lib/spa-payment-methods";
import { useEffect, useState, useTransition } from "react";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  completeSpaBooking,
  completeSpaBookingGroup,
  getSpaCheckoutOptions,
} from "@/server/actions/spa-checkout";
import type { SpaScheduleBooking } from "@/server/queries/spa-schedule";
import type { SpaCreditOptions } from "@/server/spa-checkout-credit";

type Method = SpaCheckoutPaymentMethod;
export function SpaCheckoutPanel({
  booking,
  groupBookings = [],
  customerName,
  onClose,
  onCompleted,
}: {
  booking: SpaScheduleBooking;
  groupBookings?: SpaScheduleBooking[];
  customerName: string;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [scope, setScope] = useState<"PERSON" | "GROUP">("PERSON");
  const [method, setMethod] = useState<Method>("CASH");
  const [transferLast4, setTransferLast4] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<
    | (SpaCreditOptions & {
        groupMembers?: {
          id: string;
          guestIndex?: number;
          status: string;
          serviceName: string;
          totalPrice: number;
          updatedAt: string;
          bookingDate?: string;
          startTime: string;
        }[];
      })
    | null
  >(null);
  const [optionsError, setOptionsError] = useState("");
  const [revision, setRevision] = useState(0);
  const [pending, start] = useTransition();
  useEffect(() => {
    let active = true;
    getSpaCheckoutOptions(booking.id)
      .then((r) => {
        if (!active) return;
        if (r.success) {
          setOptions(r);
          setOptionsError("");
        } else setOptionsError(r.error);
      })
      .catch(() => {
        if (active) setOptionsError("無法讀取方案與儲值，請重試。");
      });
    return () => {
      active = false;
    };
  }, [booking.id, revision]);
  const unpaid = (options?.groupMembers ?? groupBookings).filter((b) =>
    ["PENDING", "CONFIRMED"].includes(b.status),
  );
  const chargeAmount =
    scope === "GROUP"
      ? unpaid.reduce((n, b) => n + b.totalPrice, 0)
      : booking.totalPrice;
  const credit = method === "STORED_VALUE" || method === "ENTITLEMENT";
  const effectiveSourceId =
    sourceId ||
    (method === "STORED_VALUE"
      ? options?.wallets[0]?.id
      : options?.entitlements.length === 1
        ? options.entitlements[0].id
        : "") ||
    "";
  const wallet = options?.wallets.find((w) => w.id === effectiveSourceId);
  const entitlement = options?.entitlements.find(
    (e) => e.id === effectiveSourceId,
  );
  const valid =
    !credit ||
    (method === "STORED_VALUE"
      ? Boolean(wallet && wallet.balance >= booking.totalPrice)
      : Boolean(entitlement));
  function choose(value: Method) {
    setMethod(value);
    setTransferLast4("");
    setConfirmed(false);
    setError("");
    setSourceId(
      value === "STORED_VALUE"
        ? (options?.wallets[0]?.id ?? "")
        : value === "ENTITLEMENT" && options?.entitlements.length === 1
          ? options.entitlements[0].id
          : "",
    );
  }
  return (
    <RightSheet
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      width={600}
      labelledById="spa-checkout-title"
    >
      <form
        className="spa-checkout-form min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirmed || !valid) return;
          setError("");
          start(async () => {
            try {
              const r =
                scope === "GROUP"
                  ? await completeSpaBookingGroup({
                      groupId: booking.partyGroupId!,
                      bookings: unpaid.map((b) => ({
                        bookingId: b.id,
                        expectedUpdatedAt: b.updatedAt,
                        expectedAmount: b.totalPrice,
                        paymentMethod: method,
                        ...(method === "TRANSFER" ? { transferLast4 } : {}),
                      })),
                    })
                  : await completeSpaBooking({
                      bookingId: booking.id,
                      expectedUpdatedAt: booking.updatedAt,
                      expectedAmount: booking.totalPrice,
                      paymentMethod: method,
                      ...(method === "TRANSFER" ? { transferLast4 } : {}),
                      ...(credit ? { sourceId: effectiveSourceId } : {}),
                    });
              if (!r.success) {
                setError(r.error);
                setConfirmed(false);
                setRevision((v) => v + 1);
                return;
              }
              onCompleted();
            } catch {
              setError("連線失敗，請重試；同筆預約不會重複入帳。");
            }
          });
        }}
      >
        <header className="flex justify-between">
          <h2 id="spa-checkout-title" className="text-xl font-bold">
            完成並結帳
          </h2>
          <button type="button" disabled={pending} onClick={onClose}>
            關閉
          </button>
        </header>
        <section className="spa-checkout-summary space-y-2 rounded-xl border border-earth-200 bg-earth-50 p-4">
          <p className="spa-checkout-customer font-semibold">{customerName}</p>
          <p>{booking.serviceName}</p>
          <p>
            {booking.startTime}–{booking.endTime}
          </p>
          <p className="spa-checkout-total mt-3 text-2xl font-bold text-primary-800">
            服務金額 NT${chargeAmount.toLocaleString()}
          </p>
        </section>
        {booking.partyGroupId && options && unpaid.length > 1 && (
          <section className="space-y-2">
            <p className="font-semibold">結帳範圍</p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setScope("PERSON");
                  setConfirmed(false);
                }}
                className={`rounded-lg border border-earth-200 p-3 ${scope === "PERSON" ? "bg-earth-100" : ""}`}
              >
                只結這位（第 {booking.guestIndex} 位）
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setScope("GROUP");
                  choose("CASH");
                }}
                className={`rounded-lg border border-earth-200 p-3 ${scope === "GROUP" ? "bg-earth-100" : ""}`}
              >
                整組未結帳（{unpaid.length} 位）
              </button>
            </div>
            {scope === "GROUP" && (
              <div className="rounded-lg bg-earth-50 p-3 text-sm">
                {unpaid.map((b) => (
                  <p key={b.id}>
                    第 {b.guestIndex} 位 · {b.startTime} · {b.serviceName} · NT$
                    {b.totalPrice.toLocaleString()}
                  </p>
                ))}
                <p>
                  整組可用現金／刷卡／轉帳／多元支付一次完成；使用各自方案或儲值，請逐位結帳。
                </p>
              </div>
            )}
          </section>
        )}
        <fieldset disabled={pending} className="space-y-3">
          <legend className="mb-2 font-semibold">付款方式</legend>
          <div className="grid grid-cols-2 gap-3">
            {SPA_CHECKOUT_PAYMENT_METHODS.filter(
              (value) => scope !== "GROUP" || isSpaExternalPayment(value),
            ).map((value) => (
              <label
                key={value}
                className={`rounded-lg border border-earth-200 p-3 ${method === value ? "border-primary-500 bg-primary-50" : "border-earth-200"}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={method === value}
                  onChange={() => choose(value)}
                />{" "}
                {SPA_PAYMENT_LABELS[value]}
              </label>
            ))}
          </div>
          {method === "TRANSFER" && (
            <label className="block">
              轉出帳號後四碼
              <input
                required
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                minLength={4}
                maxLength={4}
                value={transferLast4}
                onChange={(e) => {
                  setTransferLast4(e.target.value.replace(/[^0-9]/g, ""));
                  setConfirmed(false);
                }}
                placeholder="例如 0123"
                className="mt-1 w-full rounded-lg border border-earth-200 p-3"
              />
            </label>
          )}
          {credit && !options && !optionsError && (
            <p role="status">讀取顧客方案與餘額中…</p>
          )}
          {credit && optionsError && (
            <p role="alert">
              {optionsError}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setRevision((v) => v + 1)}
              >
                重新讀取
              </button>
            </p>
          )}
          {method === "ENTITLEMENT" && options && (
            <>
              {options.entitlements.length ? (
                <label className="block">
                  使用方案
                  <select
                    className="mt-2 w-full rounded-lg border border-earth-200 p-3"
                    value={effectiveSourceId}
                    onChange={(e) => {
                      setSourceId(e.target.value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="">請選擇方案</option>
                    {options.entitlements.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} · 可用 {e.available} 次
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>
                  沒有適用本次全部服務且堂數足夠的有效方案，請選其他付款方式。
                </p>
              )}
              {entitlement && (
                <p className="rounded-lg bg-earth-50 p-3">
                  本次扣 {entitlement.uses} 次，扣除後可用{" "}
                  {entitlement.available - entitlement.uses} 次。無須另收現金。
                </p>
              )}
            </>
          )}
          {method === "STORED_VALUE" && options && (
            <p className="rounded-lg bg-earth-50 p-3">
              {wallet
                ? `儲值餘額 NT$${wallet.balance.toLocaleString()}，本次扣 NT$${booking.totalPrice.toLocaleString()}。${wallet.balance >= booking.totalPrice ? `扣除後 NT$${(wallet.balance - booking.totalPrice).toLocaleString()}。` : "餘額不足，請選其他付款方式。"}`
                : "此顧客沒有可用的儲值帳戶，請選其他付款方式。"}
            </p>
          )}
          {isSpaExternalPayment(method) && (
            <p className="text-sm text-earth-500">
              {SPA_COLLECTION_HINTS[method]}
            </p>
          )}
          <label className="flex items-start gap-2">
            <input
              required
              type="checkbox"
              checked={confirmed}
              disabled={!valid}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {credit
              ? "我已完成服務，並確認上述扣款／扣次"
              : "我已完成服務，並確認收到上述金額"}
          </label>
        </fieldset>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <button
          disabled={pending || !confirmed || !valid}
          className="w-full rounded-lg bg-primary-700 p-3 font-semibold text-white disabled:opacity-50"
        >
          {pending
            ? "處理中…"
            : credit
              ? "確認扣款／扣次並完成"
              : "確認收款並完成"}
        </button>
      </form>
    </RightSheet>
  );
}
