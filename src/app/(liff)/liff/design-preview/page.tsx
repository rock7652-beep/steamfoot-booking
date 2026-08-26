import { notFound } from "next/navigation";
import { liffMessages } from "@/lib/liff/messages";
import { WelcomeBack } from "../liff-shell";

/**
 * Draft PR visual review only. No customer session or production data is read.
 * Production must never expose this demonstration route.
 */
export default function LiffDesignPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-10 pt-7">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.12em] text-primary-700">
            {liffMessages.shell.designPreviewStoreName}
          </p>
          <p className="mt-0.5 text-sm text-earth-500">
            {liffMessages.shell.memberHomeLabel}
          </p>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-700 shadow-sm"
          aria-hidden
        >
          <svg
            width="23"
            height="23"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.8 3.2C12.5 3.4 6.5 6.5 5.2 12.1c-.8 3.5 1.3 6.8 4.8 6.8 6.2 0 9.8-7 10.8-15.7Z" />
            <path d="M4 21c2.4-5.3 6.6-9.2 12.5-11.7" />
          </svg>
        </div>
      </header>

      <WelcomeBack
        storeSlug="zhubei"
        displayName={liffMessages.shell.designPreviewName}
        walletSummary={{ totalAvailable: 8, hasMakeup: true }}
        healthAssessmentEnabled
      />
    </div>
  );
}
