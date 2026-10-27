import { DataTable, type Column } from "@/components/desktop";
const money=(value:number)=>`NT$ ${value.toLocaleString()}`;
export type CashDrawerDifferences={rows:{id:string;date:string;expected:number;actual:number;difference:number;note:string}[];issues:{sessionId:string;businessDate:string;saved:number;current:number;difference:number}[]};
export function CashDrawerDifferencesView({rows,issues}:CashDrawerDifferences) {
  const columns:Column<typeof rows[number]>[]=[{key:"date",header:"營業日",accessor:r=>r.date},{key:"expected",header:"應有現金",accessor:r=>money(r.expected)},{key:"actual",header:"實點現金",accessor:r=>money(r.actual)},{key:"difference",header:"差額",accessor:r=>money(r.difference)},{key:"note",header:"差額原因",accessor:r=>r.note}];
    return <details className="min-w-0 rounded-lg border border-earth-200 bg-white p-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">現金差異核對 · 本月 {rows.length} 筆點錢差額／{issues.length} 筆結帳後異動</summary>
      <p className="mb-3 text-sm text-earth-600">點錢差額比較應有現金與實點現金；結帳後異動比較原結帳紀錄與目前收支，兩者分開核對，原結帳紀錄保留。</p>
      {rows.length?<DataTable columns={columns} rows={rows} rowKey={row=>row.id}/>:<p className="py-2 text-sm">本月已結帳紀錄沒有點錢差額。</p>}
      {!!issues.length&&<div className="mt-3 space-y-2"><h3 className="font-medium">結帳後收支異動</h3>{issues.map(issue=><p key={issue.sessionId} className="text-sm">{issue.businessDate} · 原應有 {money(issue.saved)} · 目前重算 {money(issue.current)} · 差額 {money(issue.difference)}</p>)}</div>}
    </details>;
}
