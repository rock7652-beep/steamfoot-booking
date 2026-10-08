import { notFound, redirect } from "next/navigation";
import { MarketingBrand } from "@/components/marketing-brand";
import { trialGuides } from "@/lib/trial-guides";
import { GuideCards } from "./guide-cards";
export const metadata = {
  title: "資料準備教學｜蒸管家",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  // Preserve old help links without asking applicants for Developers access.
  if (topic === "developers") redirect("/pricing/trial/guide/oa-admin");
  const guide = trialGuides[topic];
  if (!guide) notFound();
  return (
    <main className="min-h-screen bg-[#f7f5ef] px-4 py-8 text-[#263d35]">
      <div className="mx-auto max-w-4xl">
        <MarketingBrand />
        <p className="mt-6 text-sm text-[#967039]">資料準備 · 電腦版操作</p>
        <h1 className="mt-2 text-2xl font-semibold">{guide.title}</h1>
        <p className="mt-2 text-sm">申請頁還在原視窗，完成後切回即可。</p>
        <GuideCards guide={guide} />
      </div>
    </main>
  );
}
