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

type RepairAudit = Pick<AuditRun, "appValidated" | "pageTokenMatches" | "callbackMatches" | "configuredFields" | "missingFields" | "pageAttached"> & {
  calls: Record<string, SafeCall>;
};

export function MessengerAuditPanel({ storeId }: { storeId: string }) {
  const [run, setRun] = useState<AuditRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);

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

  async function repairPageBinding() {
    setRunning(true);
    setError(null);
    setRepairMessage(null);
    try {
      const response = await fetch("/api/admin/messenger/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
        cache: "no-store",
      });
      const result = await response.json() as { status?: string; code?: string; classification?: string; audit?: RepairAudit };
      if (result.status === "repaired" && result.audit) {
        setRun({ id: "", status: "COMPLETED", errorCode: null, callsSafeSummary: result.audit.calls, ...result.audit });
        setRepairMessage("Page 已完成綁定與欄位訂閱，並已重新稽核。");
      } else if (result.status === "blocked") {
        setRepairMessage(`未執行 Meta 寫入：${result.code ?? "PAGE_TOKEN_VALIDATION_FAILED"}（${result.classification ?? "other_graph_error"}）。請依安全摘要更新正確的 Page Access Token 後再試。`);
      } else {
        setRepairMessage(`修復未完成：${result.code ?? "repair_unavailable"}。系統已停止後續操作。`);
      }
    } catch {
      setRepairMessage("目前無法完成修復；系統未確認寫入結果，請稍後再試。");
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

      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p>僅竹北店可用。此修復會先驗證 Page Token 是否確實對應目標粉專；驗證失敗時不會呼叫任何 Meta 寫入。</p>
        <button
          type="button"
          onClick={repairPageBinding}
          disabled={running}
          className="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? "處理中…" : "驗證並修復竹北 Messenger 訂閱"}
        </button>
        {repairMessage ? <p className="mt-3">{repairMessage}</p> : null}
      </div>

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
