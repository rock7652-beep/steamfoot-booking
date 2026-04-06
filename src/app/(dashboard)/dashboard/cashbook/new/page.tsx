import { listStaffSelectOptions } from "@/server/queries/staff";
import { createCashbookEntry } from "@/server/actions/cashbook";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

type CashbookEntryType = "INCOME" | "EXPENSE" | "WITHDRAW" | "ADJUSTMENT";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewCashbookPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "cashbook.create"))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const staffOptions = await listStaffSelectOptions();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  async function handleSubmit(formData: FormData) {
    "use server";
    const raw = {
      entryDate: formData.get("entryDate") as string,
      type: formData.get("type") as CashbookEntryType,
      category: (formData.get("category") as string) || undefined,
      amount: Number(formData.get("amount")),
      staffId: (formData.get("staffId") as string) || undefined,
      note: (formData.get("note") as string) || undefined,
    };

    const result = await createCashbookEntry(raw);

    if (!result.success) {
      redirect(`/dashboard/cashbook/new?error=${encodeURIComponent(result.error || "新增記帳失敗")}`);
    }

    redirect("/dashboard/cashbook");
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/cashbook" className="text-sm text-earth-500 hover:text-earth-700">
          ← 現金帳
        </Link>
      </div>

      {params.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      )}

      {/* Form Card */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-earth-900">新增記帳</h1>

        <form action={handleSubmit} className="space-y-4">
          {/* Entry Date */}
          <div>
            <label className="block text-sm font-medium text-earth-700">日期</label>
            <input
              type="date"
              name="entryDate"
              required
              defaultValue={today}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-earth-700">類型</label>
            <select
              name="type"
              required
              defaultValue="INCOME"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            >
              <option value="INCOME">收入</option>
              <option value="EXPENSE">支出</option>
              <option value="WITHDRAW">提領</option>
              <option value="ADJUSTMENT">調整</option>
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-earth-700">分類（選填）</label>
            <input
              type="text"
              name="category"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="例：房租、水費、銷售收入等"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-earth-700">金額（元）</label>
            <input
              type="number"
              name="amount"
              required
              min="0.01"
              step="0.01"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入金額"
            />
          </div>

          {/* Staff */}
          <div>
            <label className="block text-sm font-medium text-earth-700">
              {user.role === "OWNER" ? "歸屬店長（選填）" : "歸屬店長（自動分配）"}
            </label>
            {user.role === "OWNER" ? (
              <select
                name="staffId"
                className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              >
                <option value="">不指定</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-1 rounded-lg border border-earth-300 bg-earth-50 px-3 py-2 text-sm text-earth-600">
                自動分配給您
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-earth-700">備註（選填）</label>
            <textarea
              name="note"
              rows={3}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入備註"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 border-t pt-6">
            <button
              type="submit"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              確認新增
            </button>
            <Link
              href="/dashboard/cashbook"
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
