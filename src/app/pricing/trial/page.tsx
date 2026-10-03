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
            請一次提供本門市的申請與設定資料；不確定的項目可選「需要協助」。
          </p>
          <p className="mt-2 text-sm">
            體驗不限門市數，每間門市分開申請。最多 3
            位後台使用者；各門市完成設定及驗收後，才開始 30 天體驗。
          </p>
        </header>
        <TrialApplicationForm />
      </div>
    </main>
  );
}
