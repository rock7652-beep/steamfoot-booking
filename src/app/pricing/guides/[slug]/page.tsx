import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingNavigation } from "@/components/marketing-navigation";
import { MarketingFooter } from "@/components/marketing-footer";
import { GUIDE_CATEGORIES, findPublicGuide, guidePath } from "@/lib/public-guides";
import { MARKETING_ORIGIN, marketingMetadata } from "@/lib/marketing-seo";

// Draft visibility and indexing follow the runtime environment, not a cached build.
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = findPublicGuide((await params).slug);
  if (!guide) notFound();
  return {
    ...marketingMetadata(guidePath(guide)),
    title: `${guide.title}｜蒸管家經營指南`,
    description: guide.summary,
    ...(guide.status === "draft" ? { robots: { index: false, follow: false } } : {}),
    openGraph: { type: "article", title: guide.title, description: guide.summary, url: `${MARKETING_ORIGIN}${guidePath(guide)}` },
  };
}

export default async function PublicGuidePage({ params }: Props) {
  const guide = findPublicGuide((await params).slug);
  if (!guide) notFound();
  const category = GUIDE_CATEGORIES.find(item => item.id === guide.category)!;
  const isMusicGuide = ["music-school-leave-makeup-lesson-balance", "music-school-system-data-migration"].includes(guide.id);
  const url = `${MARKETING_ORIGIN}${guidePath(guide)}`;
  // No invented byline, publication date, review, or customer-result claims.
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", headline: guide.title, description: guide.summary, mainEntityOfPage: url, inLanguage: "zh-TW", articleSection: category.name },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "蒸管家", item: `${MARKETING_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "經營指南", item: `${MARKETING_ORIGIN}/guides` },
        { "@type": "ListItem", position: 3, name: guide.title, item: url },
      ] },
    ],
  };
  return <div className="min-h-screen bg-[#F8F5EE] text-[#153B31]">
    <MarketingNavigation active="guides" />
    <main id="main" className="mx-auto max-w-4xl px-5 py-7 sm:px-8 sm:py-10">
      <nav aria-label="麵包屑" className="flex flex-wrap items-center gap-x-2 text-sm text-[#4C6259]">
        <Link href="/" className="inline-flex min-h-11 items-center underline underline-offset-4">首頁</Link><span aria-hidden="true">／</span>
        <Link href="/guides" className="inline-flex min-h-11 items-center underline underline-offset-4">經營指南</Link><span aria-hidden="true">／</span><span>{category.name}</span>
      </nav>
      <article id={guide.id} className="scroll-mt-24">
        <header className="mb-7 border-b border-[#153B31]/15 pb-6">
          <p className="text-sm font-medium text-[#74603C]">{category.name}{guide.status === "draft" ? "・校閱草稿，尚未發布" : ""}</p>
          <h1 className="mt-3 text-3xl font-semibold leading-snug sm:text-4xl">{guide.title}</h1>
          {guide.disclosure && <p className="mt-3 text-sm leading-6 text-[#4C6259]">{guide.disclosure}</p>}
          {guide.showSummary !== false && <p className="mt-4 text-lg leading-8 text-[#4C6259]">{guide.summary}</p>}
        </header>
        {guide.format === "short" ? <>
          <section><h2 className="text-xl font-semibold">三個做法</h2><ol className="mt-4 list-decimal space-y-4 pl-6 text-base leading-8 text-[#4C6259]">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol></section>
          <figure className="mt-7 rounded-xl bg-[#EEF4F0] p-5 sm:p-6"><h2 className="text-xl font-semibold">店務範例</h2><dl className="mt-3 divide-y divide-[#153B31]/15">{guide.example.map(([label, value]) => <div key={label} className="py-3 sm:grid sm:grid-cols-[8rem_1fr] sm:gap-4"><dt className="font-semibold">{label}</dt><dd className="mt-1 text-base leading-7 text-[#4C6259] sm:mt-0">{value}</dd></div>)}</dl><figcaption className="mt-3 text-sm leading-6 text-[#4C6259]">情境與數字為範例，非實際店家成果。</figcaption></figure>
          <p className="mt-6 text-base leading-8 text-[#4C6259]">{guide.note}</p>
        </> : <>
          <div className="space-y-4 text-base leading-8 text-[#4C6259]">{guide.introduction.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
          {guide.sections.map(section => <section key={section.heading} className="mt-8"><h2 className="text-xl font-semibold leading-8 sm:text-2xl">{section.heading}</h2><div className="mt-4 space-y-4 text-base leading-8 text-[#4C6259]">{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}{section.bullets && <ul className="list-disc space-y-3 pl-6">{section.bullets.map(item => <li key={item}>{item}</li>)}</ul>}</div></section>)}
          {guide.conclusion && <p className="mt-8 text-base leading-8 text-[#4C6259]">{guide.conclusion}</p>}
          <section className="mt-8 rounded-xl border border-[#153B31]/20 bg-white p-5 sm:p-6">{guide.callToAction.heading && <h2 className="text-xl font-semibold leading-8">{guide.callToAction.heading}</h2>}<p className="mt-3 text-base leading-8 text-[#4C6259]">{guide.callToAction.text}</p><a href="https://www.steamfoot.com/apply" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#123E32] px-5 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4">{guide.callToAction.label ?? "申請免費試用 30 天 →"}</a></section>
        </>}
      </article>
      <nav aria-label="文章延伸閱讀" className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#153B31]/20 pt-5">
        <Link href={isMusicGuide ? "/pricing/features/music" : "/pricing/features#" + guide.feature} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">查看{isMusicGuide ? "音樂教室功能" : guide.featureName} →</Link>
        <Link href={`/guides#${guide.id}`} className="inline-flex min-h-11 items-center underline underline-offset-4">返回{category.name}文章列表 ↑</Link>
      </nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    </main><MarketingFooter />
  </div>;
}
