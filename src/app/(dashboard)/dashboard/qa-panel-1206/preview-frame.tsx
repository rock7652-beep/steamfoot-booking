"use client";
import { useEffect, useState } from "react";

const sizes = [{label:"手機 390",width:390,height:844},{label:"窄手機 360",width:360,height:800},{label:"iPad 橫向",width:1024,height:768},{label:"iPad 直向",width:768,height:1024},{label:"桌機",width:1440,height:900}];
const cookiePath = "/hq/dashboard/growth/candidates";
function setFailure(enabled: boolean) {
  document.cookie = `panel1206_failure=${enabled ? "1" : ""}; Path=${cookiePath}; Max-Age=${enabled ? 600 : 0}; SameSite=Lax; Secure`;
}
export function PanelAcceptanceFrame() {
  const [size,setSize] = useState(sizes[0]);
  const [failure,setFailureState] = useState(false);
  useEffect(() => { setFailure(false); return () => setFailure(false); }, []);
  return <main className="min-w-0 space-y-3 p-4">
    <h1 className="text-lg font-semibold">#1206 隔離預覽驗收</h1>
    <p>內嵌原本的潛力名單及抽屜，尺寸切換不重新載入。僅檢查讀取，不提交人才、點數或轉介紹。</p>
    <div className="flex flex-wrap gap-2">{sizes.map(s => <button key={s.label} className="min-h-11 rounded border px-3" aria-pressed={size.label === s.label} onClick={()=>setSize(s)}>{s.label}</button>)}</div>
    <button className="min-h-11 rounded border px-3" aria-pressed={failure} onClick={()=>{setFailure(!failure);setFailureState(!failure);}}>{failure ? "恢復讀取" : "模擬讀取失敗"}</button>
    <p role="status">{failure ? "讀取故障已開啟：候選頁的 Server Action 回覆 HTTP 503。" : "正常讀取"} · {size.width} × {size.height}</p>
    <div className="max-w-full overflow-auto"><iframe title="候選顧客驗收" src="/hq/dashboard/growth/candidates?devicePreview=1" width={size.width} height={size.height} className="block border" /></div>
  </main>;
}
