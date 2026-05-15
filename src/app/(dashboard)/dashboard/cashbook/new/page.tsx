import { listStaffSelectOptions } from "@/server/queries/staff";
import { createCashbookEntry } from "@/server/actions/cashbook";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { toLocalDateStr } from "@/lib/date-utils";
import { SubmitButton } from "@/components/submit-button";
import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { FormErrorToast } from "@/components/form-error-toast";
import {
  FormShell,
  FormSection,
  FormGrid,
  PageHeader,
  StickyFormActions,
} from "@/components/desktop";

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
  const today = toLocalDateStr();

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

  const inputCls =
    "block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
  const labelCls = "block text-sm font-medium text-earth-700";

  return (
    <FormShell width="md">
      <FormErrorToast />

      <PageHeader
        title="新增記帳"
        actions={
          <Link
            href="/dashboard/cashbook"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 現金管理
          </Link>
        }
      />

      <form action={handleSubmit} className="space-y-6 pb-4">
        <FormSection title="基本資料" description="日期、類型、金額為必填">
          <FormGrid>
            <div>
              <label className={labelCls}>日期</label>
              <input
                type="date"
                name="entryDate"
                required
                defaultValue={today}
                className={`mt-1 ${inputCls}`}
              />
            </div>
            <div>
              <label className={labelCls}>類型</label>
              <select name="type" required defaultValue="INCOME" className={`mt-1 ${inputCls}`}>
                <option value="INCOME">收入</option>
                <option value="EXPENSE">支出</option>
                <option value="WITHDRAW">提領</option>
                <option value="ADJUSTMENT">調整</option>
              </select>
            </div>
          </FormGrid>

          <FormGrid>
            <div>
              <label className={labelCls}>
                分類
                <span className="ml-1 text-xs text-earth-400">（選填）</span>
              </label>
              <input
                type="text"
                name="category"
                className={`mt-1 ${inputCls}`}
                placeholder="例：房租、水費、銷售收入等"
              />
            </div>
            <div>
              <label className={labelCls}>金額（元）</label>
              <input
                type="number"
                name="amount"
                required
                min="0.01"
                step="0.01"
                className={`mt-1 ${inputCls}`}
                placeholder="輸入金額"
              />
            </div>
          </FormGrid>
        </FormSection>

        {/* Staff —「登錄人」= 這筆紀錄的可見與編輯範圍歸屬。
            非 ADMIN 強制鎖定為自己；ADMIN 可指定其他店長（屬於 visibility 設定，
            不影響任何店長個人月結 / 結算 / 報表）。 */}
        <FormSection title={user.role === "ADMIN" ? "登錄人（選填）" : "登錄人"}>
          {user.role === "ADMIN" ? (
            <>
              <select name="staffId" className={inputCls}>
                <option value="">不指定</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
              <p className="text-xs text-earth-500">
                指定本筆紀錄的可見與編輯範圍。本筆金額不會算入該店長的個人支出。
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-earth-300 bg-earth-50 px-3 py-2 text-sm text-earth-600">
              自動記錄為您
            </div>
          )}
        </FormSection>

        <FormSection title="備註">
          <textarea
            name="note"
            rows={4}
            className={inputCls}
            placeholder="輸入備註（選填）"
          />
        </FormSection>

        <StickyFormActions>
          <Link
            href="/dashboard/cashbook"
            className="rounded-lg border border-earth-300 bg-white px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
          >
            取消
          </Link>
          <SubmitButton
            label="確認新增"
            pendingLabel="新增中..."
            className="bg-primary-600 text-white hover:bg-primary-700"
          />
        </StickyFormActions>
      </form>
    </FormShell>
  );
}
