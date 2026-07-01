"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FormSection } from "@/components/desktop";
import CustomerSearch from "./customer-search";
import {
  fetchCustomerActiveWalletsForBooking,
  type ActiveWalletSummary,
  type MakeupCreditSummary,
} from "@/server/actions/customer-active-wallets";

/**
 * 後台「新增預約」右欄：顧客 + 服務/方案。
 *
 * 防呆設計：選定顧客後若有可用方案
 *   1. bookingType 預設 PACKAGE_SESSION
 *   2. 自動選最快到期（FEFO）的方案
 *   3. 顯示方案名稱與剩餘堂數
 *   4. 若店長改選「單次付費，不扣堂」→ 顯示一行淡色提醒
 *
 * 補課（mode=makeup 或顧客有有效補課券）：
 *   - 預約類型多一個「補課」選項，且排在最前（有補課應優先安排）。
 *   - 「補課」在資料結構上 = bookingType=PACKAGE_SESSION + isMakeup=true，
 *     不是新的 BookingType enum；送出時用 hidden input 帶 isMakeup。
 *   - 補課券優先抵用；若張數不足，剩餘人數由 createBooking 扣方案堂數。
 *     前端不指定 makeupCreditId。
 *
 * 不動 server FEFO / 補課邏輯（server 仍是 single source of truth）；
 * 此元件只負責 UI 預設值與提示。
 */

const inputCls =
  "block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

// UI 選項：MAKEUP 為前端虛擬值；送出時轉成 bookingType=PACKAGE_SESSION + isMakeup=on。
type UiBookingType = "MAKEUP" | "PACKAGE_SESSION" | "FIRST_TRIAL" | "SINGLE";

const EMPTY_MAKEUP: MakeupCreditSummary = { count: 0, earliestExpiry: null };

/** "2026-06-22" → "06/22"（補課券到期日精簡顯示）。 */
function shortDate(iso: string | null): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return m && d ? `${m}/${d}` : iso;
}

export function CustomerAndPlanFields({
  defaultMode,
}: {
  /** 從「新增補課」入口帶入 mode=makeup 時為 "makeup"，預設選補課。 */
  defaultMode?: "makeup";
}) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [wallets, setWallets] = useState<ActiveWalletSummary[]>([]);
  const [makeup, setMakeup] = useState<MakeupCreditSummary>(EMPTY_MAKEUP);
  const [walletsLoading, setWalletsLoading] = useState(false);
  // 一律從 PACKAGE_SESSION 起手；選定顧客後若 defaultMode=makeup 且有有效補課券，
  // effect 會切到 MAKEUP（補課選項在有券前不存在，避免 select 出現孤兒值）。
  const [uiType, setUiType] = useState<UiBookingType>("PACKAGE_SESSION");
  const [walletId, setWalletId] = useState<string>("");
  // 預約日期由左欄 DashboardBookingForm（同一 form 的 select[name="bookingDate"]）控制。
  // 補課券有效性需依「預約日期」判斷，故在此讀取並監聽其變化以重查。
  const [bookingDate, setBookingDate] = useState<string | null>(null);
  const [bookingPeople, setBookingPeople] = useState(1);
  const anchorRef = useRef<HTMLSpanElement>(null);
  // 記錄已套用「預設選擇」的顧客 → 同顧客改日期時不覆蓋店長手動選擇。
  const initializedCustomerRef = useRef<string | null>(null);

  const handleCustomerSelect = useCallback((id: string | null) => {
    setCustomerId(id);
    if (!id) {
      setWallets([]);
      setMakeup(EMPTY_MAKEUP);
      setWalletId("");
      initializedCustomerRef.current = null;
    }
  }, []);

  // 讀取同一個 form 內的預約日期，並監聽其變化（切換日期 → 重查補課券有效性）。
  useEffect(() => {
    const form = anchorRef.current?.closest("form");
    if (!form) return;
    const read = () => {
      const dateEl = form.querySelector<HTMLSelectElement>(
        'select[name="bookingDate"]',
      );
      const peopleEl = form.querySelector<HTMLSelectElement>(
        'select[name="people"]',
      );
      setBookingDate(dateEl?.value ?? null);
      setBookingPeople(Number(peopleEl?.value) || 1);
    };
    read();
    form.addEventListener("change", read);
    return () => form.removeEventListener("change", read);
  }, []);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    void (async () => {
      setWalletsLoading(true);
      try {
        const { wallets: list, makeup: makeupSummary } =
          await fetchCustomerActiveWalletsForBooking(
            customerId,
            bookingDate ?? undefined,
          );
        if (cancelled) return;
        setWallets(list);
        setMakeup(makeupSummary);
        const hasMakeupNow = makeupSummary.count > 0;
        const firstLoadForCustomer =
          initializedCustomerRef.current !== customerId;
        if (firstLoadForCustomer) {
          // 首次載入此顧客 → 套預設選擇
          initializedCustomerRef.current = customerId;
          if (defaultMode === "makeup" && hasMakeupNow) {
            setUiType("MAKEUP");
            setWalletId("");
          } else if (list.length > 0) {
            setUiType("PACKAGE_SESSION");
            setWalletId(list[0].id);
          } else {
            setUiType("PACKAGE_SESSION");
            setWalletId("");
          }
        } else {
          // 同顧客改了預約日期 → 不覆蓋手動選擇；但若已選「補課」卻在新日期失效，
          // 退回課程堂數（避免送出已對該日過期的補課券）。
          setUiType((prev) =>
            prev === "MAKEUP" && !hasMakeupNow ? "PACKAGE_SESSION" : prev,
          );
          setWalletId((prev) => prev || list[0]?.id || "");
        }
      } catch {
        if (cancelled) return;
        setWallets([]);
        setMakeup(EMPTY_MAKEUP);
        setWalletId("");
      } finally {
        if (!cancelled) setWalletsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, bookingDate, defaultMode]);

  const hasWallets = wallets.length > 0;
  const hasMakeup = makeup.count > 0;
  const isMakeupSelected = uiType === "MAKEUP";
  const makeupToUse = isMakeupSelected ? Math.min(makeup.count, bookingPeople) : 0;
  const packagePeople = isMakeupSelected ? Math.max(0, bookingPeople - makeupToUse) : bookingPeople;
  const needsWalletForSelectedType =
    uiType === "PACKAGE_SESSION" || (isMakeupSelected && packagePeople > 0);
  const showSinglePackageWarning = hasWallets && uiType === "SINGLE";
  // 從補課入口進來、顧客已選、查詢完成，但沒有可用補課券 → 明確提示。
  const showNoMakeupWarning =
    defaultMode === "makeup" &&
    !!customerId &&
    !walletsLoading &&
    !hasMakeup;

  return (
    <>
      {/* 定位錨點：用來找到同一個 form，讀取左欄的預約日期 */}
      <span ref={anchorRef} className="hidden" aria-hidden />
      <FormSection title="顧客資訊" description="輸入姓名、電話或 Email 搜尋">
        <div>
          <label className={labelCls}>
            顧客 <span className="text-red-500">*</span>
          </label>
          <div className="mt-1">
            <CustomerSearch onSelect={handleCustomerSelect} />
          </div>
        </div>
      </FormSection>

      <FormSection title="服務 / 方案">
        {/* 實際送出欄位：補課 → bookingType=PACKAGE_SESSION + isMakeup=on；
            其餘維持原行為。select 本身不帶 name（純 UI）。 */}
        <input
          type="hidden"
          name="bookingType"
          value={isMakeupSelected ? "PACKAGE_SESSION" : uiType}
        />
        {isMakeupSelected && <input type="hidden" name="isMakeup" value="on" />}

        <div>
          <label className={labelCls}>
            預約類型 <span className="text-red-500">*</span>
          </label>
          <select
            value={uiType}
            onChange={(e) => setUiType(e.target.value as UiBookingType)}
            className={`mt-1 ${inputCls}`}
          >
            {/* 有有效補課券才顯示補課選項，且排最前（補課優先安排） */}
            {hasMakeup && (
              <option value="MAKEUP">
                補課（剩 {makeup.count} 張
                {makeup.earliestExpiry
                  ? `・到 ${shortDate(makeup.earliestExpiry)}`
                  : ""}
                ）
              </option>
            )}
            <option value="PACKAGE_SESSION">課程堂數</option>
            <option value="FIRST_TRIAL">體驗</option>
            <option value="SINGLE">單次付費，不扣堂</option>
          </select>
        </div>

        {/* 補課：顯示系統將如何拆分補課券與方案堂數 */}
        {customerId && isMakeupSelected && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
            將優先使用 {makeupToUse} 張補課券
            {packagePeople > 0
              ? `，剩餘 ${packagePeople} 位扣方案堂數。`
              : "，本次不扣方案堂數。"}
          </p>
        )}

        {customerId && hasWallets && needsWalletForSelectedType && (
          <div>
            <label className={labelCls}>使用課程</label>
            <select
              name="customerPlanWalletId"
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className={`mt-1 ${inputCls}`}
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.planName}（剩 {w.remainingSessions} 堂
                  {w.expiryDate ? `・到 ${w.expiryDate}` : "・無期限"}）
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-earth-500">
              {isMakeupSelected && packagePeople > 0
                ? "補課券不足的人數會使用此方案；已自動選最快到期的方案。"
                : "已自動選最快到期的方案；如需手動指定可改下拉。"}
            </p>
          </div>
        )}

        {customerId && walletsLoading && (
          <p className="text-[11px] text-earth-400">查詢顧客方案中…</p>
        )}

        {showNoMakeupWarning && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
            此顧客在此日期沒有可用補課資格；補課券須在期限內使用，請改選券期限內的預約日期，或確認是否有未過期的補課券。
          </p>
        )}

        {customerId && !walletsLoading && !hasWallets && needsWalletForSelectedType && (
          <p className="text-[11px] text-earth-500">
            此顧客目前沒有可用方案；如要使用堂數預約，請先指派或購買方案。
          </p>
        )}

        {showSinglePackageWarning && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
            本次不會扣顧客方案，請確認是否另外收費。
          </p>
        )}
      </FormSection>
    </>
  );
}
