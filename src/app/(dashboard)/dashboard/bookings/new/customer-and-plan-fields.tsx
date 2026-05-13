"use client";

import { useCallback, useEffect, useState } from "react";
import { FormSection } from "@/components/desktop";
import CustomerSearch from "./customer-search";
import {
  fetchCustomerActiveWalletsForBooking,
  type ActiveWalletSummary,
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
 * 不動 server FEFO 邏輯（server 仍是 single source of truth）；
 * 此元件只負責 UI 預設值與提示。
 */

const inputCls =
  "block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

type BookingType = "PACKAGE_SESSION" | "FIRST_TRIAL" | "SINGLE";

export function CustomerAndPlanFields() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [wallets, setWallets] = useState<ActiveWalletSummary[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [bookingType, setBookingType] = useState<BookingType>("PACKAGE_SESSION");
  const [walletId, setWalletId] = useState<string>("");

  const handleCustomerSelect = useCallback((id: string | null) => {
    setCustomerId(id);
    if (!id) {
      setWallets([]);
      setWalletId("");
    }
  }, []);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    void (async () => {
      setWalletsLoading(true);
      try {
        const list = await fetchCustomerActiveWalletsForBooking(customerId);
        if (cancelled) return;
        setWallets(list);
        if (list.length > 0) {
          // 防呆：有方案 → 預設 PACKAGE_SESSION + FEFO 首張
          setBookingType("PACKAGE_SESSION");
          setWalletId(list[0].id);
        } else {
          setWalletId("");
        }
      } catch {
        if (cancelled) return;
        setWallets([]);
        setWalletId("");
      } finally {
        if (!cancelled) setWalletsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const hasWallets = wallets.length > 0;
  const showSinglePackageWarning = hasWallets && bookingType === "SINGLE";

  return (
    <>
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
        <div>
          <label className={labelCls}>
            預約類型 <span className="text-red-500">*</span>
          </label>
          <select
            name="bookingType"
            required
            value={bookingType}
            onChange={(e) => setBookingType(e.target.value as BookingType)}
            className={`mt-1 ${inputCls}`}
          >
            <option value="PACKAGE_SESSION">課程堂數</option>
            <option value="FIRST_TRIAL">體驗</option>
            <option value="SINGLE">單次付費，不扣堂</option>
          </select>
        </div>

        {customerId && hasWallets && bookingType === "PACKAGE_SESSION" && (
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
              已自動選最快到期的方案；如需手動指定可改下拉。
            </p>
          </div>
        )}

        {customerId && walletsLoading && (
          <p className="text-[11px] text-earth-400">查詢顧客方案中…</p>
        )}

        {customerId && !walletsLoading && !hasWallets && (
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
