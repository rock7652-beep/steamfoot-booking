// Synthetic geometry fixture: real shell/sheet components, no account or data access.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { OperationGuideShell, OperationGuideTrigger } from "../../src/components/operation-guide-shell";
import { RightSheet } from "../../src/components/admin/right-sheet";
import "../../src/app/globals.css";

function Fixture() {
  const [extraHeader, setExtraHeader] = useState(false);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("customer");
  const [collapsed, setCollapsed] = useState(false);
  return <OperationGuideShell enabled access={{ module: "spa", permissions: [], features: {} }}>
    <div data-spa-admin="true">
      <aside className="hidden md:fixed md:inset-y-0 md:block" style={{ width: collapsed ? 64 : undefined }}>
        Synthetic SPA sidebar
      </aside>
      <div className={collapsed ? "md:pl-16" : "md:pl-(--sidebar-width)"}>
        <header data-dashboard-header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-earth-200 bg-white/95 px-3 py-1 backdrop-blur-sm sm:px-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:min-w-64">
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" className="min-h-11" onClick={() => setCollapsed(v => !v)}>收合側欄</button>
              <OperationGuideTrigger />
              <button type="button" className="min-h-11" onClick={() => setExtraHeader(v => !v)}>切換長頁首</button>
            </div>
          </div>
          <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2 sm:gap-3">
            <span>沐光舒療 SPA 示範店 後台</span><span>林沐晴 店長 老闆</span>
          </div>
          {extraHeader && <div data-extra-header className="w-full py-5">額外換行的店名與狀態：測試非視窗縮放引起的高度變動</div>}
        </header>
        <main className="p-4">
          <h1>SPA 顧客抽屜定位測試</h1>
        </main>
        <RightSheet open width={620} onClose={() => undefined} labelledById="fixture-title"
          className={kind === "unmarked" ? "" : "spa-customer-header-offset"}
          presentation={kind === "centered" ? "centered" : "side"}>
          <header className="flex items-center justify-between gap-3 p-5">
            <h2 id="fixture-title">{loading ? "讀取顧客資料中" : "SPA 合成顧客"}</h2>
            <button type="button" className="min-h-11 px-3">關閉</button>
          </header>
          <div className="space-y-3 p-5">
            <label className="block">未儲存草稿<textarea aria-label="未儲存草稿" defaultValue="縮放前的草稿" /></label>
            <button type="button" className="min-h-11 rounded-lg px-3" onClick={() => setLoading(v => !v)}>切換載入完成</button>
            <label className="block">抽屜範圍<select aria-label="抽屜範圍" value={kind} onChange={e => setKind(e.target.value)}>
              <option value="customer">SPA 顧客</option><option value="unmarked">其他抽屜</option><option value="centered">置中彈窗</option>
            </select></label>
          </div>
        </RightSheet>
      </div>
    </div>
  </OperationGuideShell>;
}

function Harness() {
  const [width, setWidth] = useState(768);
  const [height, setHeight] = useState(1024);
  return <main style={{ padding: 8 }}>
    <p>Isolated fixture only. No backend, sign-in, or real customer data.</p>
    <label>視窗寬度<select aria-label="視窗寬度" value={width} onChange={e => setWidth(Number(e.target.value))}>
      {[560, 767, 768, 1024, 1366].map(v => <option key={v} value={v}>{v}</option>)}
    </select></label>
    <label>視窗高度<select aria-label="視窗高度" value={height} onChange={e => setHeight(Number(e.target.value))}>
      {[768, 1024].map(v => <option key={v} value={v}>{v}</option>)}
    </select></label>
    <iframe title="SPA header fixture" src="/?frame=1" style={{ display: "block", boxSizing: "content-box", width, height, border: "1px solid #aaa" }} />
  </main>;
}

createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("frame") ? <Fixture /> : <Harness />);
