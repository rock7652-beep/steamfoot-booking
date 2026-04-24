"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { updateShopBankInfo } from "@/server/actions/shop";

interface Props {
  initial: {
    bankName: string | null;
    bankCode: string | null;
    bankAccountNumber: string | null;
    lineOfficialUrl: string | null;
  };
}

export function PaymentSettingsForm({ initial }: Props) {
  const [bankName, setBankName] = useState(initial.bankName ?? "");
  const [bankCode, setBankCode] = useState(initial.bankCode ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(initial.bankAccountNumber ?? "");
  const [lineOfficialUrl, setLineOfficialUrl] = useState(initial.lineOfficialUrl ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-earth-700">銀行名稱</label>
        <input
          type="text"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          maxLength={100}
          placeholder="例：永豐銀行"
          className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-earth-700">銀行代號</label>
        <input
          type="text"
          value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          maxLength={20}
          placeholder="例：807"
          className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-earth-700">銀行帳號</label>
        <input
          type="text"
          value={bankAccountNumber}
          onChange={(e) => setBankAccountNumber(e.target.value)}
          maxLength={50}
          placeholder="例：19301800020681"
          className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
        />
        <p className="mt-1 text-xs text-earth-400">顧客將此帳號複製到網銀轉帳</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-earth-700">LINE@ 連結</label>
        <input
          type="url"
          value={lineOfficialUrl}
          onChange={(e) => setLineOfficialUrl(e.target.value)}
          maxLength={500}
          placeholder="例：https://lin.ee/UvRnFFK"
          className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
        />
        <p className="mt-1 text-xs text-earth-400">顧客轉帳後點此連結聯繫店長確認</p>
      </div>

      <div className="flex gap-3 border-t pt-6">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "儲存中..." : "儲存"}
        </button>
        <Link
          href="/dashboard/settings"
          className="rounded-lg border border-earth-300 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
