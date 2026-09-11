import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { toLocalDateStr } from "@/lib/date-utils";
import { HealthRecordForm } from "./health-record-form";

export default async function NewHealthRecordPage() {
  const user = await getCurrentUser();
  const store = await getStoreContext();
  if (!user || user.role !== "CUSTOMER" || !store?.storeId) redirect("/");

  const prefix = `/s/${store.storeSlug}`;
  if (!(await hasStoreFeature(store.storeId, FEATURES.AI_HEALTH_SUMMARY))) {
    redirect(`${prefix}/health`);
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href={`${prefix}/health`}
          aria-label="返回健康評估"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center text-earth-700"
        >
          &larr;
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-earth-900">新增健康量測</h1>
          <p className="mt-1 text-sm text-earth-600">資料會直接存入你的既有健康紀錄</p>
        </div>
      </div>
      <HealthRecordForm requestId={randomUUID()} today={toLocalDateStr()} />
    </div>
  );
}
