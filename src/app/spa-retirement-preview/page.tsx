import Link from "next/link";
import { notFound } from "next/navigation";
import { isSpaRetirementUiPreview } from "../../../scripts/guide-ui-preview-scope.mjs";
import { BookingTypes } from "../pricing/booking-types";
import NewStoreForm from "../hq/dashboard/stores/new/new-store-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "模組調整預覽 — 蒸管家", robots: { index: false, follow: false } };

export default function SpaRetirementPreview() {
  if (!isSpaRetirementUiPreview()) notFound();
  return <main className="min-w-0 bg-earth-50 py-5 text-earth-900">
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <h1 className="admin-page-title">模組調整預覽</h1>
      <p className="mt-2 text-sm text-earth-600">保留時段（蒸足）、音樂教室與運動教室。以下僅供預覽，不會建立門市。</p>
      <nav aria-label="預覽入口" className="mt-3 flex flex-wrap gap-4 text-sm">
        <Link href="/" className="inline-flex min-h-11 items-center underline">官網</Link>
        <Link href="/pricing/features" className="inline-flex min-h-11 items-center underline">功能介紹</Link>
        <Link href="/apply" className="inline-flex min-h-11 items-center underline">申請表</Link>
        <a href="#new-store" className="inline-flex min-h-11 items-center underline">開店選項</a>
      </nav>
    </div>
    <BookingTypes />
    <section id="new-store" aria-label="開店選項預覽" className="mx-auto max-w-2xl scroll-mt-5 px-5 sm:px-8">
      <NewStoreForm previewOnly />
    </section>
  </main>;
}
