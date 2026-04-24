import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getShopConfig } from "@/lib/shop-config";
import { updateShopBankInfo } from "@/server/actions/shop";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { SubmitButton } from "@/components/submit-button";

export default async function PaymentSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "plans.edit"))) {
    redirect("/dashboard");
  }

  const shopConfig = await getShopConfig(user.storeId);

  async function handleSubmit(formData: FormData) {
    "use server";
    const result = await updateShopBankInfo({
      bankName: (formData.get("bankName") as string) || null,
      bankCode: (formData.get("bankCode") as string) || null,
      bankAccountNumber: (formData.get("bankAccountNumber") as string) || null,
      lineOfficialUrl: (formData.get("lineOfficialUrl") as string) || null,
    });
    if (!result.success) {
      throw new Error(result.error || "儲存付款設定失敗");
    }
    revalidatePath("/dashboard/settings/payment");
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/settings" className="text-sm text-earth-500 hover:text-earth-700">
          ← 設定
        </Link>
        <h1 className="text-xl font-bold text-earth-900">付款設定</h1>
      </div>

      <div className="rounded-xl border border-earth-200 bg-white p-6 shadow-sm">
        <p className="mb-6 text-sm text-earth-500">
          這些資訊會顯示在前台購買頁，讓顧客知道怎麼轉帳、怎麼聯繫店長確認。
        </p>

        <form action={handleSubmit} className="space-y-4">
          {/* Bank Name */}
          <div>
            <label className="block text-sm font-medium text-earth-700">銀行名稱</label>
            <input
              type="text"
              name="bankName"
              defaultValue={shopConfig.bankName ?? ""}
              maxLength={100}
              placeholder="例：永豐銀行"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
          </div>

          {/* Bank Code */}
          <div>
            <label className="block text-sm font-medium text-earth-700">銀行代號</label>
            <input
              type="text"
              name="bankCode"
              defaultValue={shopConfig.bankCode ?? ""}
              maxLength={20}
              placeholder="例：807"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
          </div>

          {/* Bank Account Number */}
          <div>
            <label className="block text-sm font-medium text-earth-700">銀行帳號</label>
            <input
              type="text"
              name="bankAccountNumber"
              defaultValue={shopConfig.bankAccountNumber ?? ""}
              maxLength={50}
              placeholder="例：19301800020681"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
            <p className="mt-1 text-xs text-earth-400">顧客將此帳號複製到網銀轉帳</p>
          </div>

          {/* LINE Official URL */}
          <div>
            <label className="block text-sm font-medium text-earth-700">LINE@ 連結</label>
            <input
              type="url"
              name="lineOfficialUrl"
              defaultValue={shopConfig.lineOfficialUrl ?? ""}
              maxLength={500}
              placeholder="例：https://lin.ee/UvRnFFK"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
            <p className="mt-1 text-xs text-earth-400">顧客轉帳後點此連結聯繫店長確認</p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 border-t pt-6">
            <SubmitButton
              label="儲存"
              pendingLabel="儲存中..."
              className="bg-primary-600 text-white hover:bg-primary-700"
            />
            <Link
              href="/dashboard/settings"
              className="rounded-lg border border-earth-300 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              取消
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
