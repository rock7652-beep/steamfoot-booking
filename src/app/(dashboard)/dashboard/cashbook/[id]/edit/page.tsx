import { listStaffSelectOptions } from "@/server/queries/staff";
import { updateCashbookEntry } from "@/server/actions/cashbook";
import { listClosedBusinessDates } from "@/server/queries/cash-drawer";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { notFound, redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { FormErrorToast } from "@/components/form-error-toast";
import { prisma } from "@/lib/db";
import {
  FormShell,
  FormSection,
  PageHeader,
  StickyFormActions,
} from "@/components/desktop";
import { CashbookFormFields } from "../../cashbook-form-fields";

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
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  if (storeViewContext?.isViewMode) {
    redirect("/dashboard/cashbook");
  }

  const entry = await prisma.cashbookEntry.findUnique({
    where: { id },
  });
  if (!entry) notFound();

  const staffOptions = await listStaffSelectOptions();

  const entryDate = entry.entryDate.toISOString().slice(0, 10);

  // 閉店日提示用：以此筆紀錄日期為中心 ±180 天的已閉店營業日（前端即時提示，後端仍 guard）
  const [ey, em, ed] = entryDate.split("-").map(Number);
  const windowFrom = new Date(Date.UTC(ey, em - 1, ed));
  windowFrom.setUTCDate(windowFrom.getUTCDate() - 180);
  const windowTo = new Date(Date.UTC(ey, em - 1, ed));
  windowTo.setUTCDate(windowTo.getUTCDate() + 180);
  const closedDates = await listClosedBusinessDates(
    entry.storeId,
    windowFrom.toISOString().slice(0, 10),
    windowTo.toISOString().slice(0, 10),
  );

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
      confirmClosedCashbookChange: formData.get("confirmClosedCashbookChange") === "on",
    });

    if (!result.success) {
      // 不要 throw 到 error boundary（會整頁變「發生錯誤」）；改用 ?error= 停留在表單頁，
      // 由 FormErrorToast 以 toast 顯示清楚訊息（如：請先勾選確認）。
      redirect(
        `/dashboard/cashbook/${id}/edit?error=${encodeURIComponent(result.error || "編輯記帳失敗")}`,
      );
    }

    redirect("/dashboard/cashbook");
  }

  const inputCls =
    "block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";

  return (
    <FormShell width="md">
      <FormErrorToast />

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
        <CashbookFormFields
          closedDates={closedDates}
          defaultEntryDate={entryDate}
          defaultType={entry.type}
          defaultCategory={entry.category ?? ""}
          defaultAmount={entry.amount.toString()}
          defaultPaymentMethod={entry.paymentMethod}
        />

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
