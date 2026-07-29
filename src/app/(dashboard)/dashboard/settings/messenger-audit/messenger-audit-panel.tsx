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

type TokenFormat = { tokenLength: number; hasWrappingQuotes: boolean; hasNewline: boolean; trimChangesLength: boolean };
type TokenFingerprintResult = {
  runtime: TokenFormat & { fingerprint: string };
  local: TokenFormat & { fingerprint: string };
  fingerprintsMatch: boolean;
  graphChecks: Record<string, SafeCall & { error: { type?: string; code?: number; subcode?: number; fbtraceId?: string; messageSummary?: string } | null }>;
};

type GraphDiagnosticResult = {
  classification: string;
  findings: string[];
  calls: Record<string, SafeCall & { error: { type?: string; code?: number; subcode?: number; fbtraceId?: string; messageSummary?: string } | null; identity?: string }>;
};

export function MessengerAuditPanel({ storeId }: { storeId: string }) {
  const [run, setRun] = useState<AuditRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [localToken, setLocalToken] = useState("");
  const [tokenDiagnosis, setTokenDiagnosis] = useState<TokenFingerprintResult | null>(null);
  const [tokenDiagnosisError, setTokenDiagnosisError] = useState<string | null>(null);
  const [graphDiagnosis, setGraphDiagnosis] = useState<GraphDiagnosticResult | null>(null);
  const [graphDiagnosisError, setGraphDiagnosisError] = useState<string | null>(null);

  async function sha256Prefix(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12);
  }

  async function diagnoseTokenFingerprint() {
    setRunning(true);
    setTokenDiagnosis(null);
    setTokenDiagnosisError(null);
    try {
      const localFormat: TokenFormat = {
        tokenLength: localToken.length,
        hasWrappingQuotes: (localToken.startsWith('"') && localToken.endsWith('"')) || (localToken.startsWith("'") && localToken.endsWith("'")),
        hasNewline: /[\r\n]/.test(localToken),
        trimChangesLength: localToken.length !== localToken.trim().length,
      };
      const response = await fetch("/api/admin/messenger/token-fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, localFingerprint: await sha256Prefix(localToken), localFormat }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("token_diagnosis_failed");
      setTokenDiagnosis(await response.json() as TokenFingerprintResult);
    } catch {
      setTokenDiagnosisError("目前無法完成指紋診斷；Token 不會傳送到伺服器。");
    } finally {
      setLocalToken("");
      setRunning(false);
    }
  }

  async function runGraphDiagnostic() {
    setRunning(true);
    setGraphDiagnosis(null);
    setGraphDiagnosisError(null);
    try {
      const response = await fetch("/api/admin/messenger/graph-diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("graph_diagnosis_failed");
      setGraphDiagnosis(await response.json() as GraphDiagnosticResult);
    } catch {
      setGraphDiagnosisError("目前無法完成 Graph 診斷；未執行任何 Meta 寫入。");
    } finally {
      setRunning(false);
    }
  }

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

      <div className="mt-5 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <p className="font-medium">Production Page Token 指紋比對</p>
        <p className="mt-1">Token 僅在此瀏覽器計算 SHA-256 指紋，不會傳送、記錄或顯示原文。</p>
        <label className="mt-3 block" htmlFor="messenger-page-token">剛複製的 Page Access Token</label>
        <input id="messenger-page-token" type="password" autoComplete="off" value={localToken} onChange={(event) => setLocalToken(event.target.value)} className="mt-1 w-full rounded border border-sky-300 bg-white px-3 py-2" />
        <button type="button" onClick={diagnoseTokenFingerprint} disabled={running || !localToken} className="mt-3 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60">
          {running ? "處理中…" : "比對 Production Token 指紋"}
        </button>
        {tokenDiagnosisError ? <p className="mt-3 text-red-700">{tokenDiagnosisError}</p> : null}
        {tokenDiagnosis ? <TokenFingerprintSummary result={tokenDiagnosis} /> : null}
      </div>

      <div className="mt-5 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
        <p className="font-medium">Production Meta Graph 唯讀診斷</p>
        <p className="mt-1">使用 runtime App 與 Page token 執行 GET-only 檢查；結果只保留安全錯誤欄位，不含憑證、Page 名稱或原始回應。</p>
        <button type="button" onClick={runGraphDiagnostic} disabled={running} className="mt-3 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60">
          {running ? "處理中…" : "執行 Meta Graph 診斷"}
        </button>
        {graphDiagnosisError ? <p className="mt-3 text-red-700">{graphDiagnosisError}</p> : null}
        {graphDiagnosis ? <GraphDiagnosticSummary result={graphDiagnosis} /> : null}
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

function TokenFingerprintSummary({ result }: { result: TokenFingerprintResult }) {
  return <div className="mt-4 space-y-3">
    <p className="font-medium">指紋{result.fingerprintsMatch ? "一致" : "不一致"}</p>
    <p>Production：{result.runtime.fingerprint}；本機：{result.local.fingerprint}</p>
    <TokenFormatSummary label="Production" value={result.runtime} />
    <TokenFormatSummary label="本機貼上值" value={result.local} />
    <div><p className="font-medium">唯讀 Graph 檢查</p><ul className="mt-1 space-y-1">{Object.entries(result.graphChecks).map(([name, call]) => <li key={name}>{name}: {call.ok ? "OK" : "失敗"}（HTTP {call.httpStatus ?? "—"}{call.error?.type ? `，${call.error.type}` : ""}{call.error?.code !== undefined ? `，code ${call.error.code}` : ""}{call.error?.subcode !== undefined ? `，subcode ${call.error.subcode}` : ""}{call.error?.fbtraceId ? `，fbtrace ${call.error.fbtraceId}` : ""}{call.error?.messageSummary ? `，${call.error.messageSummary}` : ""}）</li>)}</ul></div>
  </div>;
}

function GraphDiagnosticSummary({ result }: { result: GraphDiagnosticResult }) {
  return <div className="mt-4 space-y-3">
    <p className="font-medium">判定：{result.classification}</p>
    <p>證據分類：{result.findings.join("、")}</p>
    <ul className="space-y-1">{Object.entries(result.calls).map(([name, call]) => <li key={name}>{name}: {call.ok ? "OK" : "失敗"}（HTTP {call.httpStatus ?? "—"}{call.identity ? `，${call.identity}` : ""}{call.error?.type ? `，${call.error.type}` : ""}{call.error?.code !== undefined ? `，code ${call.error.code}` : ""}{call.error?.subcode !== undefined ? `，subcode ${call.error.subcode}` : ""}{call.error?.fbtraceId ? `，fbtrace ${call.error.fbtraceId}` : ""}{call.error?.messageSummary ? `，${call.error.messageSummary}` : ""}）</li>)}</ul>
  </div>;
}

function TokenFormatSummary({ label, value }: { label: string; value: TokenFormat }) {
  return <p>{label}：長度 {value.tokenLength}；前後引號 {value.hasWrappingQuotes ? "有" : "無"}；換行 {value.hasNewline ? "有" : "無"}；trim 長度改變 {value.trimChangesLength ? "是" : "否"}</p>;
}

function Result({ label, value }: { label: string; value: boolean | null }) {
  return <div className="rounded-lg bg-earth-50 px-3 py-2 text-earth-700">{label}：{value === null ? "未完成" : value ? "是" : "否"}</div>;
}

function FieldList({ label, values }: { label: string; values: string[] }) {
  return <div><p className="font-medium text-earth-800">{label}</p><p className="mt-1 text-earth-600">{values.length ? values.join("、") : "無"}</p></div>;
}
