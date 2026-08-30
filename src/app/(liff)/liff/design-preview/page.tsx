import { notFound } from "next/navigation";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { getSpaDemoPreviewData } from "@/server/queries/spa-demo-preview";
import { toLocalDateStr } from "@/lib/date-utils";
import { SpaServiceComposerPreview } from "../_components/spa-service-composer-preview";

export default async function LiffDesignPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== SPA_DEMO_STORE.slug) notFound();

  const { presentation } = await getSpaDemoPreviewData();
  const displayStoreName = presentation.name.replace(/\s*示範店$/, "");

  return (
    <div className="spa-preview-page mx-auto flex max-w-md flex-col gap-5 px-5 pb-10 pt-7">
      <style>{`.liff-customer-ui:has(.spa-preview-page) > footer { display: none; }`}</style>
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.12em] text-primary-700">
            {displayStoreName}
          </p>
          <p className="mt-0.5 text-sm text-earth-500">線上預約</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-700 shadow-sm" aria-hidden>
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.8 3.2C12.5 3.4 6.5 6.5 5.2 12.1c-.8 3.5 1.3 6.8 4.8 6.8 6.2 0 9.8-7 10.8-15.7Z" />
            <path d="M4 21c2.4-5.3 6.6-9.2 12.5-11.7" />
          </svg>
        </div>
      </header>

      <SpaServiceComposerPreview previewDate={toLocalDateStr()} />
    </div>
  );
}
