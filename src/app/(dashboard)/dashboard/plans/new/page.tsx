import { createPlan } from "@/server/actions/plan";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { SubmitButton } from "@/components/submit-button";
import { FormErrorToast } from "@/components/form-error-toast";

type PlanCategory = "TRIAL" | "SINGLE" | "PACKAGE";

export default async function NewPlanPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "wallet.create"))) {
    redirect("/dashboard");
  }

  async function handleSubmit(formData: FormData) {
    "use server";
    const result = await createPlan({
      name: formData.get("name") as string,
      category: formData.get("category") as PlanCategory,
      price: Number(formData.get("price")),
      sessionCount: Number(formData.get("sessionCount")),
      validityDays: formData.get("validityDays")
        ? Number(formData.get("validityDays"))
        : undefined,
      description: formData.get("description") as string,
      sortOrder: formData.get("sortOrder")
        ? Number(formData.get("sortOrder"))
        : undefined,
      publicVisible: formData.get("publicVisible") === "on",
    });

    if (!result.success) {
      redirect(`/dashboard/plans/new?error=${encodeURIComponent(result.error || "新增方案失敗")}`);
    }

    redirect("/dashboard/plans");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <FormErrorToast />

      <form action={handleSubmit}>
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 border-b border-earth-200 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              href="/dashboard/plans"
              className="text-sm text-earth-500 hover:text-earth-700"
            >
              ← 返回方案列表
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-earth-900">新增課程方案</h1>
            <p className="mt-1 text-sm text-earth-500">
              設定價格、堂數、有效期限與前台顯示狀態
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Link
              href="/dashboard/plans"
              className="rounded-lg border border-earth-300 bg-white px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              取消
            </Link>
            <SubmitButton
              label="儲存"
              pendingLabel="儲存中..."
              className="bg-primary-600 text-white hover:bg-primary-700"
            />
          </div>
        </div>

        {/* 2-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: 基本資料 */}
          <section className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-earth-200 bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-base font-semibold text-earth-800">基本資料</h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Name — full width on 2-col grid */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-earth-700">
                    方案名稱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    placeholder="例：入門課程方案"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-earth-700">
                    類別 <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="category"
                    required
                    defaultValue="SINGLE"
                    className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
                  >
                    <option value="TRIAL">體驗</option>
                    <option value="SINGLE">單次</option>
                    <option value="PACKAGE">課程</option>
                  </select>
                </div>

                {/* Sort Order */}
                <div>
                  <label className="block text-sm font-medium text-earth-700">排序（選填）</label>
                  <input
                    type="number"
                    name="sortOrder"
                    min="0"
                    step="1"
                    className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    placeholder="數字越小越靠前，預設 0"
                  />
                </div>

                {/* Price */}
                <div>
                  <label className="block text-sm font-medium text-earth-700">
                    價格（元） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="price"
                    required
                    min="0"
                    step="1"
                    className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    placeholder="輸入價格"
                  />
                </div>

                {/* Session Count */}
                <div>
                  <label className="block text-sm font-medium text-earth-700">
                    堂數 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="sessionCount"
                    required
                    min="1"
                    step="1"
                    className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    placeholder="輸入堂數"
                  />
                </div>

                {/* Validity Days */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-earth-700">有效天數（選填）</label>
                  <input
                    type="number"
                    name="validityDays"
                    min="1"
                    step="1"
                    className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    placeholder="留空表示無期限"
                  />
                </div>

                {/* Description — full width */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-earth-700">描述（選填）</label>
                  <textarea
                    name="description"
                    rows={3}
                    className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    placeholder="輸入方案描述"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Right: 狀態 + 摘要 */}
          <section className="space-y-6">
            {/* 方案狀態 */}
            <div className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-earth-800">方案狀態</h2>

              {/* isActive: 新增時預設 true，但不顯示 checkbox 因為已明示新建即上架；若要允許建立後即下架則需顯示 */}
              <div className="rounded-lg border border-earth-200 bg-earth-50 p-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="publicVisible"
                    className="mt-0.5 h-4 w-4 rounded border-earth-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-earth-800">顧客可購買</div>
                    <div className="mt-0.5 text-xs text-earth-500">
                      勾選後前台 <code className="rounded bg-earth-100 px-1">/book/shop</code> 會顯示此方案。
                    </div>
                  </div>
                </label>
              </div>

              <div className="mt-4 space-y-1 rounded-lg bg-earth-50 p-3 text-xs leading-relaxed text-earth-600">
                <p>
                  <span className="font-medium text-green-700">上架 + 顧客可購買</span>：前台可購買
                </p>
                <p>
                  <span className="font-medium text-blue-700">上架 + 僅後台指派</span>：顧客看不到，店長可指派
                </p>
                <p>
                  <span className="font-medium text-red-600">下架</span>：前後台都不可新增使用
                </p>
              </div>

              <p className="mt-3 text-xs text-earth-400">
                新增後預設為「上架中」。日後可在方案列表一鍵切換上架狀態。
              </p>
            </div>

            {/* 方案摘要（新增頁：儲存後可檢視）*/}
            <div className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-earth-800">方案摘要</h2>
              <p className="rounded-lg bg-earth-50 p-4 text-center text-xs text-earth-500">
                儲存後此處會顯示單堂均價、有效期限等摘要。
              </p>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
