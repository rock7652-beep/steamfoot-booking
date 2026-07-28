"use client";

import { useState } from "react";

type SafeCall = { ok: boolean; httpStatus: number | null; error: string | null };
type AuditRun = {
  id: string;
  status: string;
  appValidated: boolean | null;
  pageTokenMatches: boolean | null;
  callbackMatches: boolean | null;
  configuredFields: string[];
  missingFields: string[];
  pageAttached: boolean | null;
  callsSafeSummary: Record<string, SafeCall> | null;
  errorCode: string | null;
};

export function MessengerAuditPanel({ storeId }: { storeId: string }) {
  const [run, setRun] = useState<AuditRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function runAudit() {
    setRunning(true);
    setError(null);
    setRun(null);
    try {
      const created = await fetch("/api/admin/messenger/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
        cache: "no-store",
      });
      if (!created.ok) throw new Error("audit_request_failed");
      const { auditRunId } = await created.json() as { auditRunId?: string };
      if (!auditRunId) throw new Error("audit_request_failed");

      const result = await fetch(`/api/admin/messenger/audit/${encodeURIComponent(auditRunId)}`, { cache: "no-store" });
      if (!result.ok) throw new Error("audit_result_unavailable");
      setRun(await result.json() as AuditRun);
    } catch {
      setError("目前無法完成稽核；請稍後再試。結果不會顯示任何憑證。");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-earth-600">此操作只會讀取 Meta 控制面設定並保存去識別化結果，不會訂閱、更新或傳送任何資料。</p>
      <button
        type="button"
        onClick={runAudit}
        disabled={running}
        className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? "稽核中…" : "執行 Messenger 稽核"}
      </button>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {run ? (
        <div className="mt-5 space-y-4 text-sm">
          <p className="font-medium text-earth-900">狀態：{run.status}{run.errorCode ? `（${run.errorCode}）` : ""}</p>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Result label="App 可驗證" value={run.appValidated} />
            <Result label="Page Token 對應" value={run.pageTokenMatches} />
            <Result label="Webhook callback 一致" value={run.callbackMatches} />
            <Result label="Page 已附加 App" value={run.pageAttached} />
          </dl>
          <FieldList label="已設定 fields" values={run.configuredFields} />
          <FieldList label="缺少 fields" values={run.missingFields} />
          <div>
            <p className="font-medium text-earth-800">Graph 呼叫摘要</p>
            <ul className="mt-1 space-y-1 text-earth-600">
              {Object.entries(run.callsSafeSummary ?? {}).map(([name, call]) => (
                <li key={name}>{name}: {call.ok ? "OK" : "失敗"}（HTTP {call.httpStatus ?? "—"}{call.error ? `，${call.error}` : ""}）</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Result({ label, value }: { label: string; value: boolean | null }) {
  return <div className="rounded-lg bg-earth-50 px-3 py-2 text-earth-700">{label}：{value === null ? "未完成" : value ? "是" : "否"}</div>;
}

function FieldList({ label, values }: { label: string; values: string[] }) {
  return <div><p className="font-medium text-earth-800">{label}</p><p className="mt-1 text-earth-600">{values.length ? values.join("、") : "無"}</p></div>;
}
