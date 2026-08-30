import Link from "next/link";
import { notFound } from "next/navigation";
import { toLocalDateStr } from "@/lib/date-utils";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { getSpaDemoPreviewData } from "@/server/queries/spa-demo-preview";
import { SpaServiceComposerPreview } from "../../_components/spa-service-composer-preview";

export default async function SpaBookingPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== SPA_DEMO_STORE.slug) notFound();

  const { presentation } = await getSpaDemoPreviewData();
  const displayStoreName = presentation.name.replace(/\s*示範店$/, "");

  return (
    <div className="spa-preview-page mx-auto flex max-w-md flex-col gap-5 px-5 pb-10 pt-7">
      <style>{`.liff-customer-ui:has(.spa-preview-page) > footer { display: none; }`}</style>
      <header>
        <Link
          href={`/s/${presentation.slug}/liff/design-preview`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-earth-600"
        >
          ‹ 會員中心
        </Link>
        <p className="mt-1 text-sm font-semibold tracking-[0.12em] text-primary-700">
          {displayStoreName}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-earth-900">
          預約服務
        </h1>
      </header>

      <SpaServiceComposerPreview previewDate={toLocalDateStr()} />
    </div>
  );
}
