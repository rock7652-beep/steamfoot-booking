'use client';
export default function CourseAgreementError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl space-y-4 px-5 py-12"><h1 className="text-2xl font-semibold text-primary-900">暫時無法開啟約定書</h1><p className="text-base leading-7 text-earth-700">請稍後重試；若仍無法開啟，可聯絡店家協助。</p><button type="button" onClick={reset} className="min-h-11 rounded-lg bg-primary-700 px-4 py-2 text-white">重新嘗試</button></main>;
}
