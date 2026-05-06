/**
 * Auth route-group loading fallback.
 *
 * (auth)/layout.tsx 在 Server Component 階段 await getCurrentUser() 與
 * getStoreContext()；若該 await 還在飛行（例如冷啟動 / DB 慢），這份
 * skeleton 會出現。formed 對齊 login / register / reset-password 共用的
 * `max-w-sm` 白卡 + 標題 + 表單欄位 結構。
 */
export default function AuthLoading() {
  return (
    <div className="w-full max-w-sm animate-pulse rounded-xl border border-earth-200 bg-white p-6 shadow-sm sm:p-8">
      {/* Title */}
      <div className="mb-1 h-7 w-40 rounded bg-earth-200" />
      <div className="mb-6 h-3 w-24 rounded bg-earth-100" />

      {/* 2 個表單欄位 */}
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-12 rounded bg-earth-200" />
            <div className="h-9 w-full rounded-lg border border-earth-200 bg-white" />
          </div>
        ))}

        {/* 主按鈕 */}
        <div className="h-9 w-full rounded-lg bg-primary-100" />
      </div>
    </div>
  );
}
