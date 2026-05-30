import { listStaffSelectOptions } from "@/server/queries/staff";
import { createCashbookEntry } from "@/server/actions/cashbook";
import { listClosedBusinessDates } from "@/server/queries/cash-drawer";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { toLocalDateStr } from "@/lib/date-utils";
import { SubmitButton } from "@/components/submit-button";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { FormErrorToast } from "@/components/form-error-toast";
import {
  FormShell,
  FormSection,
  PageHeader,
  StickyFormActions,
} from "@/components/desktop";
import { CashbookFormFields } from "../cashbook-form-fields";

type CashbookEntryType = "INCOME" | "EXPENSE" | "WITHDRAW" | "ADJUSTMENT";
type PaymentMethod = "CASH" | "OTHER";

export default async function NewCashbookPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "cashbook.create"))) {
    redirect("/dashboard");
  }

  const staffOptions = await listStaffSelectOptions();
  const today = toLocalDateStr();

  // 閉店日提示用：撈此店近 ~180 天到今天的已閉店營業日（前端即時提示，後端仍 guard）
  const activeStoreId = await getActiveStoreForRead(user);
  const [ty, tm, td] = today.split("-").map(Number);
  const fromDate = new Date(Date.UTC(ty, tm - 1, td));
  fromDate.setUTCDate(fromDate.getUTCDate() - 180);
  const closedDates = activeStoreId
    ? await listClosedBusinessDates(activeStoreId, fromDate.toISOString().slice(0, 10), today)
    : [];

  async function handleSubmit(formData: FormData) {
    "use server";
    const raw = {
      entryDate: formData.get("entryDate") as string,
      type: formData.get("type") as CashbookEntryType,
      category: (formData.get("category") as string) || undefined,
      amount: Number(formData.get("amount")),
      paymentMethod: (formData.get("paymentMethod") as PaymentMethod) || undefined,
      staffId: (formData.get("staffId") as string) || undefined,
      note: (formData.get("note") as string) || undefined,
      confirmClosedCashbookChange: formData.get("confirmClosedCashbookChange") === "on",
    };

    const result = await createCashbookEntry(raw);

    if (!result.success) {
      redirect(`/dashboard/cashbook/new?error=${encodeURIComponent(result.error || "新增記帳失敗")}`);
    }

    redirect("/dashboard/cashbook");
  }

  const inputCls =
    "block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";

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
        {/* 桌機 / iPad 橫向：2 欄（左 基本資料 + 登錄人、右 付款方式 + 備註），
            避免單欄扁長；窄螢幕自動落回單欄。 */}
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <CashbookFormFields
            closedDates={closedDates}
            defaultEntryDate={today}
            defaultType="INCOME"
            defaultCategory=""
            defaultAmount=""
            defaultPaymentMethod={null}
          />

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
        </div>

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
