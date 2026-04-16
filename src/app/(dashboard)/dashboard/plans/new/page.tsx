import { createPlan } from "@/server/actions/plan";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { FormErrorToast } from "@/components/form-error-toast";

type PlanCategory = "TRIAL" | "SINGLE" | "PACKAGE";

interface PageProps {}

export default async function NewPlanPage({}: PageProps) {
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
    });

    if (!result.success) {
      redirect(`/dashboard/plans/new?error=${encodeURIComponent(result.error || "新增方案失敗")}`);
    }

    redirect("/dashboard/plans");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <FormErrorToast />
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/plans" className="text-sm text-earth-500 hover:text-earth-700">
          ← 課程方案
        </Link>
      </div>

      {/* Form Card */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-earth-900">新增課程方案</h1>

        <form action={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-earth-700">方案名稱</label>
            <input
              type="text"
              name="name"
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="例：入門課程方案"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-earth-700">類別</label>
            <select
              name="category"
              required
              defaultValue="SINGLE"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            >
              <option value="TRIAL">體驗</option>
              <option value="SINGLE">單次</option>
              <option value="PACKAGE">課程</option>
            </select>
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-earth-700">價格（元）</label>
            <input
              type="number"
              name="price"
              required
              min="0"
              step="1"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入價格"
            />
          </div>

          {/* Session Count */}
          <div>
            <label className="block text-sm font-medium text-earth-700">堂數</label>
            <input
              type="number"
              name="sessionCount"
              required
              min="1"
              step="1"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入堂數"
            />
          </div>

          {/* Validity Days */}
          <div>
            <label className="block text-sm font-medium text-earth-700">有效天數（選填）</label>
            <input
              type="number"
              name="validityDays"
              min="1"
              step="1"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入有效天數，留空表示無期限"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-earth-700">描述（選填）</label>
            <textarea
              name="description"
              rows={3}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入方案描述"
            />
          </div>

          {/* Sort Order */}
          <div>
            <label className="block text-sm font-medium text-earth-700">排序（選填）</label>
            <input
              type="number"
              name="sortOrder"
              min="0"
              step="1"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="數字越小越靠前，預設 0"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 border-t pt-6">
            <SubmitButton
              label="確認新增"
              pendingLabel="新增中..."
              className="bg-primary-600 text-white hover:bg-primary-700"
            />
            <Link
              href="/dashboard/plans"
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
