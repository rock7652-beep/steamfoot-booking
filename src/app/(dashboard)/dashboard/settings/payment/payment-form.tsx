"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateShopBankInfo } from "@/server/actions/shop";

interface Props {
  initial: {
    bankName: string | null;
    bankCode: string | null;
    bankAccountNumber: string | null;
    lineOfficialUrl: string | null;
  };
}

const inputCls =
  "mt-1 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

export function PaymentSettingsForm({ initial }: Props) {
  const [bankName, setBankName] = useState(initial.bankName ?? "");
  const [bankCode, setBankCode] = useState(initial.bankCode ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(initial.bankAccountNumber ?? "");
  const [lineOfficialUrl, setLineOfficialUrl] = useState(initial.lineOfficialUrl ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const hasAnyInfo = Boolean(
    bankName || bankCode || bankAccountNumber || lineOfficialUrl,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateShopBankInfo({
        bankName: bankName || null,
        bankCode: bankCode || null,
        bankAccountNumber: bankAccountNumber || null,
        lineOfficialUrl: lineOfficialUrl || null,
      });
      if (result.success) {
        toast.success("付款資訊已更新，顧客現在可以看到轉帳資訊");
        router.refresh();
      } else {
        toast.error(result.error ?? "儲存失敗");
      }
    });
  }

  function copyAccount() {
    if (!bankAccountNumber) return;
    navigator.clipboard.writeText(bankAccountNumber).then(
      () => toast.success("已複製帳號"),
      () => toast.error("複製失敗"),
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 lg:grid-cols-12"
    >
      {/* Left: form */}
      <div className="lg:col-span-7">
        <section className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
          <header className="mb-4">
            <h2 className="text-sm font-semibold text-earth-900">付款資訊</h2>
            <p className="mt-0.5 text-[11px] text-earth-500">
              下列欄位會即時反映在右側預覽
            </p>
          </header>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>銀行名稱</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  maxLength={100}
                  placeholder="例：永豐銀行"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>銀行代號</label>
                <input
                  type="text"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  maxLength={20}
                  placeholder="例：807"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>銀行帳號</label>
              <input
                type="text"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                maxLength={50}
                placeholder="例：19301800020681"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-earth-400">顧客將此帳號複製到網銀轉帳</p>
            </div>

            <div>
              <label className={labelCls}>LINE@ 連結</label>
              <input
                type="url"
                value={lineOfficialUrl}
                onChange={(e) => setLineOfficialUrl(e.target.value)}
                maxLength={500}
                placeholder="例：https://lin.ee/UvRnFFK"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-earth-400">
                顧客轉帳後點此連結聯繫店長確認
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-earth-100 pt-4">
            <span className="text-[11px] text-earth-400">
              {pending ? "儲存中..." : "變更後請儲存"}
            </span>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {pending ? "儲存中..." : "儲存"}
            </button>
          </div>
        </section>
      </div>

      {/* Right: customer-facing preview */}
      <div className="lg:col-span-5">
        <section className="lg:sticky lg:top-4 rounded-xl border border-earth-200 bg-earth-50/40 p-5 shadow-sm">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-earth-900">前台預覽</h2>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-earth-500">
              顧客看到的樣子
            </span>
          </header>

          <div className="rounded-xl border border-earth-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-earth-900">
              轉帳資訊
            </h3>

            {!hasAnyInfo ? (
              <p className="rounded-md bg-earth-50 px-3 py-4 text-center text-xs text-earth-500">
                尚未填寫付款資訊
                <br />
                顧客將看不到轉帳指示
              </p>
            ) : (
              <dl className="space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="shrink-0 text-xs text-earth-500">銀行</dt>
                  <dd className="text-right font-medium text-earth-800">
                    {bankName || (
                      <span className="text-earth-300">（未填）</span>
                    )}
                    {bankCode && (
                      <span className="ml-1 text-[11px] text-earth-500">
                        ({bankCode})
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="shrink-0 text-xs text-earth-500">帳號</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono text-sm tabular-nums text-earth-800">
                      {bankAccountNumber || (
                        <span className="font-sans text-earth-300">（未填）</span>
                      )}
                    </span>
                    {bankAccountNumber && (
                      <button
                        type="button"
                        onClick={copyAccount}
                        className="rounded-md border border-earth-200 bg-white px-2 py-0.5 text-[11px] text-earth-600 hover:bg-earth-50"
                      >
                        複製
                      </button>
                    )}
                  </dd>
                </div>
              </dl>
            )}

            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
              轉帳後請透過官方 LINE 聯繫店長確認，提供您的姓名與末 5 碼。
            </p>

            <div className="mt-3">
              {lineOfficialUrl ? (
                <a
                  href={lineOfficialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-full items-center justify-center rounded-lg bg-[#06C755] text-sm font-semibold text-white hover:bg-[#05b34c]"
                >
                  聯繫店長 LINE
                </a>
              ) : (
                <div className="flex h-10 w-full items-center justify-center rounded-lg bg-earth-100 text-sm font-medium text-earth-400">
                  尚未設定 LINE 連結
                </div>
              )}
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-earth-500">
            預覽僅顯示重點欄位，實際前台呈現可能因主題與裝置略有差異。
          </p>
        </section>
      </div>
    </form>
  );
}
