import { notFound } from "next/navigation";
import {
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { PublicTrialLiffBridge } from "./public-trial-liff-bridge";

export const dynamic = "force-dynamic";

export default async function PublicTrialLiffPage() {
  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== "zhubei") notFound();

  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) notFound();

  if (!presentation.liffId) {
    return <BridgeUnavailable contactUrl={presentation.contactUrl} />;
  }

  return (
    <PublicTrialLiffBridge
      liffId={presentation.liffId}
      storeSlug={presentation.slug}
      storeName={presentation.name}
      contactUrl={presentation.contactUrl}
    />
  );
}

function BridgeUnavailable({ contactUrl }: { contactUrl: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-5 py-12">
      <section className="w-full rounded-2xl border border-earth-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-earth-900">體驗預約暫時無法開啟</h1>
        <p className="mt-3 text-sm leading-6 text-earth-600">請稍後再試，或直接聯繫竹北店協助預約。</p>
        <a href={contactUrl} className="mt-5 flex min-h-11 items-center justify-center rounded-xl bg-[#06C755] px-4 text-sm font-bold text-white">
          聯繫竹北店
        </a>
      </section>
    </main>
  );
}
