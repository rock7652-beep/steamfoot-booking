import { getPlanDetail } from "@/server/queries/plan";
import { updatePlan } from "@/server/actions/plan";
import { getCurrentUser } from "@/lib/session";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

type PlanCategory = "TRIAL" | "SINGLE" | "PACKAGE";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPlanPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();
  if (user.role !== "OWNER") notFound();

  const plan = await getPlanDetail(id);

  async function handleSubmit(formData: FormData) {
    "use server";
    const result = await updatePlan(id, {
      name: formData.get("name") as string,
      category: formData.get("category") as PlanCategory,
      price: Number(formData.get("price")),
      sessionCount: Number(formData.get("sessionCount")),
      validityDays: formData.get("validityDays")
        ? Number(formData.get("validityDays"))
        : null,
      description: formData.get("description") as string,
      sortOrder: formData.get("sortOrder")
        ? Number(formData.get("sortOrder"))
        : 0,
    });

    if (!result.success) {
      throw new Error(result.error?.message || "編輯方案失敗");
    }

    redirect("/dashboard/plans");
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/plans" className="text-sm text-gray-500 hover:text-gray-700">
          ← 課程方案
        </Link>
      </div>

      {/* Form Card */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-gray-900">編輯課程方案</h1>

        <form action={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">方案名稱</label>
            <input
              type="text"
              name="name"
              required
              defaultValue={plan.name}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="例：入門課程套餐"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700">類別</label>
            <select
              name="category"
              required
              defaultValue={plan.category}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="TRIAL">體驗</option>
              <option value="SINGLE">單次</option>
              <option value="PACKAGE">套餐</option>
            </select>
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700">價格（元）</label>
            <input
              type="number"
              name="price"
              required
              min="0"
              step="1"
              defaultValue={plan.price.toString()}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="輸入價格"
            />
          </div>

          {/* Session Count */}
          <div>
            <label className="block text-sm font-medium text-gray-700">堂數</label>
            <input
              type="number"
              name="sessionCount"
              required
              min="1"
              step="1"
              defaultValue={plan.sessionCount}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="輸入堂數"
            />
          </div>

          {/* Validity Days */}
          <div>
            <label className="block text-sm font-medium text-gray-700">有效天數（選填）</label>
            <input
              type="number"
              name="validityDays"
              min="1"
              step="1"
              defaultValue={plan.validityDays ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="輸入有效天數，留空表示無期限"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700">描述（選填）</label>
            <textarea
              name="description"
              rows={3}
              defaultValue={plan.description ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="輸入方案描述"
            />
          </div>

          {/* Sort Order */}
          <div>
            <label className="block text-sm font-medium text-gray-700">排序（選填）</label>
            <input
              type="number"
              name="sortOrder"
              min="0"
              step="1"
              defaultValue={plan.sortOrder}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="數字越小越靠前"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 border-t pt-6">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              確認編輯
            </button>
            <Link
              href="/dashboard/plans"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
