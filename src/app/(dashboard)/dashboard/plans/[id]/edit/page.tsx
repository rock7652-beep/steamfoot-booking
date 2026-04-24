import { getPlanDetail } from "@/server/queries/plan";
import { updatePlan } from "@/server/actions/plan";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { DashboardLink as Link } from "@/components/dashboard-link";

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "wallet.create"))) {
    redirect("/dashboard");
  }

  const plan = await getPlanDetail(id);

  async function handleSubmit(formData: FormData) {
    "use server";
    const result = await updatePlan(id, {
      name: formData.get("name") as string,
      price: Number(formData.get("price")),
      sessionCount: Number(formData.get("sessionCount")),
      validityDays: formData.get("validityDays")
        ? Number(formData.get("validityDays"))
        : null,
      description: formData.get("description") as string,
      sortOrder: formData.get("sortOrder")
        ? Number(formData.get("sortOrder"))
        : 0,
      isActive: formData.get("isActive") === "on",
      publicVisible: formData.get("publicVisible") === "on",
    });

    if (!result.success) {
      throw new Error(result.error || "編輯方案失敗");
    }

    redirect("/dashboard/plans");
  }

  const price = Number(plan.price);
  const avgPerSession = plan.sessionCount > 0 ? Math.round(price / plan.sessionCount) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
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
            <h1 className="mt-2 text-2xl font-bold text-earth-900">編輯課程方案</h1>
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
                {/* Name — full width */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-earth-700">
                    方案名稱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={plan.name}
                    className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    placeholder="例：入門課程方案"
                  />
                </div>

                {/* Category — disabled */}
                <div>
                  <label className="block text-sm font-medium text-earth-700">類別</label>
                  <select
                    name="category"
                    defaultValue={plan.category}
                    disabled
                    className="mt-1 block w-full cursor-not-allowed rounded-lg border border-earth-200 bg-earth-50 px-3 py-2 text-sm text-earth-500"
                  >
                    <option value="TRIAL">體驗</option>
                    <option value="SINGLE">單次</option>
                    <option value="PACKAGE">課程</option>
                  </select>
                  <p className="mt-1 text-xs text-earth-400">
                    類別不可變更，避免影響歷史交易分類。如需更換類別，請新增替代方案。
                  </p>
                </div>

                {/* Sort Order */}
                <div>
                  <label className="block text-sm font-medium text-earth-700">排序（選填）</label>
                  <input
                    type="number"
                    name="sortOrder"
                    min="0"
                    step="1"
                    defaultValue={plan.sortOrder}
                    className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    placeholder="數字越小越靠前"
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
                    defaultValue={plan.price.toString()}
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
                    defaultValue={plan.sessionCount}
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
                    defaultValue={plan.validityDays ?? ""}
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
                    defaultValue={plan.description ?? ""}
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

              <div className="space-y-3">
                {/* isActive */}
                <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-earth-200 bg-earth-50 p-3">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={plan.isActive}
                    className="mt-0.5 h-4 w-4 rounded border-earth-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-earth-800">上架中</div>
                    <div className="mt-0.5 text-xs text-earth-500">
                      後台可指派、前台可購買的前提。下架後既有錢包不受影響。
                    </div>
                  </div>
                </label>

                {/* publicVisible */}
                <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-earth-200 bg-earth-50 p-3">
                  <input
                    type="checkbox"
                    name="publicVisible"
                    defaultChecked={plan.publicVisible}
                    className="mt-0.5 h-4 w-4 rounded border-earth-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-earth-800">顧客可購買</div>
                    <div className="mt-0.5 text-xs text-earth-500">
                      勾選後前台 <code className="rounded bg-earth-100 px-1">/book/shop</code> 會顯示此方案（需同時上架）。
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
            </div>

            {/* 方案摘要 — server render 目前值 */}
            <div className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-earth-800">方案摘要</h2>
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-baseline justify-between">
                  <dt className="text-earth-500">目前價格</dt>
                  <dd className="text-lg font-semibold text-primary-700">
                    NT$ {price.toLocaleString()}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-earth-500">堂數</dt>
                  <dd className="text-earth-800">{plan.sessionCount} 堂</dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-earth-500">單堂均價</dt>
                  <dd className="text-earth-800">
                    {avgPerSession > 0 ? `NT$ ${avgPerSession.toLocaleString()}` : "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-earth-500">有效天數</dt>
                  <dd className="text-earth-800">
                    {plan.validityDays ? `${plan.validityDays} 天` : "無期限"}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 border-t border-earth-100 pt-3 text-xs text-earth-400">
                摘要反映儲存後的狀態；修改欄位後請按上方「儲存」才會更新。
              </p>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
