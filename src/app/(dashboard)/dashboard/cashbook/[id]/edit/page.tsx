import { listStaffSelectOptions } from "@/server/queries/staff";
import { updateCashbookEntry } from "@/server/actions/cashbook";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { prisma } from "@/lib/db";
import {
  FormShell,
  FormSection,
  FormGrid,
  PageHeader,
  StickyFormActions,
} from "@/components/desktop";

type CashbookEntryType = "INCOME" | "EXPENSE" | "WITHDRAW" | "ADJUSTMENT";
type PaymentMethod = "CASH" | "OTHER";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCashbookPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "cashbook.create"))) {
    redirect("/dashboard");
  }

  const entry = await prisma.cashbookEntry.findUnique({
    where: { id },
  });
  if (!entry) notFound();

  const staffOptions = await listStaffSelectOptions();

  const entryDate = entry.entryDate.toISOString().slice(0, 10);

  async function handleSubmit(formData: FormData) {
    "use server";
    const result = await updateCashbookEntry(id, {
      entryDate: formData.get("entryDate") as string,
      type: formData.get("type") as CashbookEntryType,
      category: formData.get("category") as string,
      amount: Number(formData.get("amount")),
      paymentMethod: (formData.get("paymentMethod") as PaymentMethod) || undefined,
      staffId: (formData.get("staffId") as string) || null,
      note: formData.get("note") as string,
    });

    if (!result.success) {
      throw new Error(result.error || "編輯記帳失敗");
    }

    redirect("/dashboard/cashbook");
  }

  const inputCls =
    "block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
  const labelCls = "block text-sm font-medium text-earth-700";

  return (
    <FormShell width="md">
      <PageHeader
        title="編輯記帳"
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
                defaultValue={entryDate}
                className={`mt-1 ${inputCls}`}
              />
            </div>
            <div>
              <label className={labelCls}>類型</label>
              <select
                name="type"
                required
                defaultValue={entry.type}
                className={`mt-1 ${inputCls}`}
              >
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
                defaultValue={entry.category ?? ""}
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
                defaultValue={entry.amount.toString()}
                className={`mt-1 ${inputCls}`}
                placeholder="輸入金額"
              />
            </div>
          </FormGrid>
        </FormSection>

        <FormSection title="付款方式" description="請選擇此筆現金帳的收付方式（必選）">
          <div className="grid grid-cols-2 gap-3">
            <label className="cursor-pointer">
              <input
                type="radio"
                name="paymentMethod"
                value="CASH"
                required
                defaultChecked={entry.paymentMethod === "CASH"}
                className="peer sr-only"
              />
              <div className="rounded-xl border-2 border-earth-200 bg-white px-4 py-4 text-center transition hover:border-earth-300 peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-checked:ring-2 peer-checked:ring-primary-200 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-300">
                <div className="text-base font-semibold text-earth-800">現金</div>
                <div className="mt-1 text-xs text-earth-500">實際收付現金</div>
              </div>
            </label>
            <label className="cursor-pointer">
              <input
                type="radio"
                name="paymentMethod"
                value="OTHER"
                required
                defaultChecked={entry.paymentMethod === "OTHER"}
                className="peer sr-only"
              />
              <div className="rounded-xl border-2 border-earth-200 bg-white px-4 py-4 text-center transition hover:border-earth-300 peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-checked:ring-2 peer-checked:ring-primary-200 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-300">
                <div className="text-base font-semibold text-earth-800">其他</div>
                <div className="mt-1 text-xs text-earth-500">匯款 / 轉帳 / 非現金</div>
              </div>
            </label>
          </div>
        </FormSection>

        {/* Staff —「登錄人」= 這筆紀錄的可見與編輯範圍歸屬。
            非 ADMIN 鎖定原登錄人；ADMIN 可改派其他店長（屬於 visibility 設定，
            不影響任何店長個人月結 / 結算 / 報表）。 */}
        <FormSection title={user.role === "ADMIN" ? "登錄人（選填）" : "登錄人"}>
          {user.role === "ADMIN" ? (
            <>
              <select
                name="staffId"
                defaultValue={entry.staffId ?? ""}
                className={inputCls}
              >
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
              {staffOptions.find((s) => s.id === entry.staffId)?.displayName || "不指定"}
            </div>
          )}
        </FormSection>

        <FormSection title="備註">
          <textarea
            name="note"
            rows={4}
            defaultValue={entry.note ?? ""}
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
            label="確認編輯"
            pendingLabel="儲存中..."
            className="bg-primary-600 text-white hover:bg-primary-700"
          />
        </StickyFormActions>
      </form>
    </FormShell>
  );
}
