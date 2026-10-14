// Real shared components with synthetic actions; never a database acceptance run.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { QueryForm } from "../../src/components/query-form";
import { WorkspaceLoading } from "../../src/components/workspace-loading";
import { CashDrawerActionForm } from "../../src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-action-form";
function Fixture() {
  const [reject, setReject] = useState(false);
  const [rows, setRows] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  return <main className="mx-auto w-full max-w-[1100px] space-y-4 p-4 text-earth-900">
    <Toaster position="top-right" richColors closeButton />
    <h1 className="text-xl font-semibold">導航穩定性合成預覽</h1>
    <p>保留工作台、就地回饋；資料與操作均為合成。</p>
    <aside className="rounded-xl border border-earth-200 bg-white p-4" data-persistent-navigation>工作台導覽</aside>
    <label className="flex min-h-11 items-center gap-2"><input aria-label="模擬拒絕" type="checkbox" checked={reject} onChange={event => setReject(event.target.checked)} />模擬拒絕</label>
    <section className="rounded-xl border border-earth-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">原地新增收支</h2>
      <CashDrawerActionForm returnPath={location.pathname + location.search} submitLabel="新增收支" action={async (_previous, data) => {
        await new Promise(resolve => setTimeout(resolve, 350));
        if (reject) return { success: false, error: "模擬金額核對失敗，輸入已保留" };
        setRows(previous => [...previous, String(data.get("amount"))]);
        return { success: true, data: { entryId: `synthetic-${rows.length + 1}` } };
      }}><label className="block">金額<input required type="number" name="amount" aria-label="金額" min="1" className="mt-2 min-h-11 w-full rounded-lg border border-earth-300 px-3" /></label></CashDrawerActionForm>
      <ul aria-label="已確認的合成紀錄">{rows.map((value, index) => <li key={index}>已新增 {value}</li>)}</ul>
    </section>
    <QueryForm className="flex flex-wrap gap-3 rounded-xl border border-earth-200 bg-white p-4">
      <label className="min-w-0 flex-1">篩選<input name="search" defaultValue="合成" className="mt-2 min-h-11 w-full rounded-lg border px-3" /></label>
      <button className="min-h-11 rounded border px-3">查詢</button>
    </QueryForm>
    <button className="min-h-11 rounded border px-3" onClick={() => setLoading(value => !value)}>切換載入骨架</button>
    {loading && <WorkspaceLoading settings />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
