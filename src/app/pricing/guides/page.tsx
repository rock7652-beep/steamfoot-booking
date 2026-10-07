import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { marketingMetadata } from "@/lib/marketing-seo";
import { GUIDE_CATEGORIES, findPublicGuide, guidePath, visiblePublicGuides } from "@/lib/public-guides";
import { MarketingNavigation } from "@/components/marketing-navigation";
import { MarketingFooter } from "@/components/marketing-footer";

// Draft visibility must be evaluated for each environment at request time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...marketingMetadata("/guides"),
  title: "店長經營指南｜蒸管家",
  description: "店務經營做法：安排預約、顧客追蹤、收款對帳、商品盤點與維修保養接件。選一個問題，把方法帶回店裡。",
};

export default async function StoreGuidesPage({ searchParams }: { searchParams: Promise<{ guide?: string | string[] }> }) {
  const requested = (await searchParams).guide;
  const selected = typeof requested === "string" ? findPublicGuide(requested) : undefined;
  // Existing ?guide=ID links now open the same content at its stable URL.
  if (selected) permanentRedirect(guidePath(selected));
  const guides = visiblePublicGuides();
  return <div className="min-h-screen bg-[#F8F5EE] text-[#153B31]">
    <MarketingNavigation active="guides" />
    <main id="main" className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <p className="text-sm font-medium text-[#74603C]">店長經營指南</p>
      <h1 className="mt-2 text-3xl font-semibold leading-snug sm:text-4xl">選一件事，把做法帶回店裡。</h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-[#4C6259]">這裡分享店務做法；系統能做什麼請看<Link href="/pricing/features" className="inline-flex min-h-11 items-center underline underline-offset-4">功能介紹</Link>，按哪裡、怎麼設定，請在登入後台後查看「操作指南」。</p>
      <nav id="guide-list" aria-label="經營指南分類" className="mt-4 flex flex-wrap gap-3 scroll-mt-24">{GUIDE_CATEGORIES.map(category => <a key={category.id} href={"#guides-" + category.id} className="inline-flex min-h-11 items-center rounded-full border border-[#153B31]/20 bg-white px-4 text-base focus-visible:outline-2 focus-visible:outline-offset-2">{category.name} ↓</a>)}</nav>
      {GUIDE_CATEGORIES.map(category => <section key={category.id} id={"guides-" + category.id} aria-labelledby={"title-" + category.id} className="mt-7 scroll-mt-24">
        <h2 id={"title-" + category.id} className="mb-3 text-xl font-semibold">{category.name}</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{guides.filter(guide => guide.category === category.id).map(guide => <article key={guide.id} id={guide.id} className="flex scroll-mt-24 flex-col rounded-xl border border-[#153B31]/20 bg-white p-5">
          {guide.status === "draft" && <p className="mb-2 text-sm font-medium text-[#74603C]">校閱草稿・尚未發布</p>}
          <h3 className="text-lg font-semibold leading-7"><Link href={guidePath(guide)} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">{guide.title}</Link></h3>
          <p className="mt-2 grow text-base leading-7 text-[#4C6259]">{guide.summary}</p>
          <Link href={guidePath(guide)} aria-label={"閱讀：" + guide.title} className="mt-3 inline-flex min-h-11 items-center self-start font-semibold underline underline-offset-4">閱讀文章 →</Link>
        </article>)}</div>
      </section>)}
    </main><MarketingFooter />
  </div>;
}
