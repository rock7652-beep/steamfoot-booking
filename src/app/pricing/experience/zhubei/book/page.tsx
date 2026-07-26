import type { Metadata } from "next";
import { ZhubeiTrialBookingForm } from "./zhubei-trial-booking-form";

export const metadata: Metadata = {
  title: "預約竹北蒸足體驗｜暖暖蒸足",
  description: "預約暖暖蒸足竹北店首次體驗，蒸足原價 NT$799，首次體驗 NT$499。",
};

export default function ZhubeiTrialBookingPage() {
  return (
    <main className="min-h-dvh bg-[#fbf8f3] px-4 py-8 text-earth-900">
      <div className="mx-auto max-w-md">
        <header className="text-center">
          <p className="text-sm font-medium text-primary-700">暖暖蒸足｜竹北店</p>
          <h1 className="mt-2 text-2xl font-bold">預約首次蒸足體驗</h1>
          <p className="mt-3 text-sm leading-6 text-earth-600">
            蒸足原價 <span className="line-through">NT$799</span>
            <span className="ml-2 font-semibold text-primary-700">首次體驗 NT$499</span>
          </p>
          <p className="mt-1 text-xs text-earth-500">約 45 分鐘・不需要先購買正式方案</p>
        </header>

        <ZhubeiTrialBookingForm />
      </div>
    </main>
  );
}
