import { MarketingBrand } from "@/components/marketing-brand";
import { TrialApplicationForm } from "./trial-application-form";
export const metadata = {
  title: "申請體驗版｜蒸管家",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#263d35]">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <MarketingBrand />
        <header className="my-8">
          <p className="mb-2 text-sm text-[#967039]">蒸管家 · 店家體驗申請</p>
          <h1 className="text-3xl font-semibold">開始你的 30 天體驗</h1>
          <p className="mt-3">
            先填基本資料，我們會協助 LINE 串接，再安排視訊帶您完成第一筆預約。
          </p>
          <p className="mt-2 text-sm">體驗額度、可用功能及到期處理，以<a href="/pricing#trial-details" className="inline-flex min-h-11 items-center underline underline-offset-4">方案頁的完整體驗說明</a>為準。此頁協助準備開通與操作教學資料。</p>
          <p className="mt-2 text-sm">
            選填資料可先留白，必填資料不確定時請聯絡我們協助。課表與方案可後續逐步建立；繼續使用時可沿用試用資料。
          </p>
        </header>
        <TrialApplicationForm />
      </div>
    </main>
  );
}
