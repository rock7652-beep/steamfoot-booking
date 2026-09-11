export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6" aria-busy="true">
      <h1 className="text-xl font-semibold text-earth-800">編輯顧客資料</h1>
      <p role="status" className="text-sm text-earth-600">正在讀取最新資料，請稍候…</p>
      <div aria-hidden="true" className="animate-pulse space-y-4">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-12 rounded-lg bg-earth-100" />)}
      </div>
    </div>
  );
}
