import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { toLocalDateStr } from "@/lib/date-utils";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import {
  resolveCentralMemberLiffId,
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { HealthRecordForm } from "@/app/(customer)/health/new/health-record-form";
import { getOwnedLiffHealthRecord } from "@/server/actions/liff-health";

export const dynamic = "force-dynamic";

export default async function EditLiffHealthRecordPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  const storeSlug = await resolveStoreSlugForLiff();
  if (!storeSlug) notFound();
  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) notFound();
  if (!(await hasStoreFeature(presentation.id, FEATURES.AI_HEALTH_SUMMARY))) notFound();
  if (!(await resolveCentralMemberLiffId(storeSlug))) notFound();

  const record = await getOwnedLiffHealthRecord(recordId);
  if (!record) notFound();
  const backPath = `/s/${presentation.slug}/liff/health`;

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href={backPath}
          aria-label="返回健康紀錄"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center text-earth-700"
        >
          &larr;
        </Link>
        <div>
          <p className="text-xs uppercase tracking-widest text-earth-500">
            {record.storeName}
          </p>
          <h1 className="text-2xl font-bold text-earth-900">編輯健康量測</h1>
          <p className="mt-1 text-sm text-earth-600">只會修改這一筆紀錄</p>
        </div>
      </div>
      <HealthRecordForm
        requestId={randomUUID()}
        today={toLocalDateStr()}
        storeSlug={presentation.slug}
        surface="liff"
        mode="edit"
        recordId={record.recordId}
        initialValues={record}
      />
    </div>
  );
}
