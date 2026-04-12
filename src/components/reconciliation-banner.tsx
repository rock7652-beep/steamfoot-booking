import Link from "next/link";

interface ReconciliationBannerProps {
  status: string;
  mismatchCount: number;
  errorCount: number;
  startedAt: Date;
  failedChecks: { checkName: string; status: string }[];
}

export function ReconciliationBanner({
  status,
  mismatchCount,
  errorCount,
  startedAt,
  failedChecks,
}: ReconciliationBannerProps) {
  if (status === "pass") return null;

  const isError = status === "error";
  const timeStr = new Date(startedAt).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`mb-4 rounded-xl border px-4 py-3 ${
        isError
          ? "border-red-200 bg-red-50"
          : "border-yellow-200 bg-yellow-50"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-lg">{isError ? "\u26A0" : "\u26A0"}</span>
          <div>
            <p
              className={`text-sm font-semibold ${
                isError ? "text-red-800" : "text-yellow-800"
              }`}
            >
              {isError ? "對帳異常" : "對帳不一致"}
              {mismatchCount > 0 && (
                <span className="ml-1.5 rounded bg-yellow-200 px-1.5 py-0.5 text-xs font-medium text-yellow-800">
                  {mismatchCount} 項不符
                </span>
              )}
              {errorCount > 0 && (
                <span className="ml-1.5 rounded bg-red-200 px-1.5 py-0.5 text-xs font-medium text-red-800">
                  {errorCount} 項錯誤
                </span>
              )}
            </p>
            <p
              className={`mt-0.5 text-xs ${
                isError ? "text-red-600" : "text-yellow-700"
              }`}
            >
              {failedChecks.map((c) => c.checkName).join("、")}
              <span className="ml-2 text-earth-400">({timeStr})</span>
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/reconciliation"
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            isError
              ? "bg-red-100 text-red-700 hover:bg-red-200"
              : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
          }`}
        >
          查看詳情
        </Link>
      </div>
    </div>
  );
}
