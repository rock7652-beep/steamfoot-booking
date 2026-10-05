"use client";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { ModalPanel } from "@/components/admin/modal-panel";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { OperationHistoryButton } from "@/components/operation-history-button";
import { toLocalDateStr } from "@/lib/date-utils";
import { categoryPrice,priceCategories,productSearch,type PriceCategory, inventoryReport, lineTotal, type InventoryData, type InventoryOrderView, type LineInput } from "@/lib/inventory";
import { loadInventory, saveOrder, savePayment, saveProduct, saveSupplier, saveStockCount, receiveGoods, confirmReceivingCost } from "@/server/actions/inventory";
import { createCustomer } from "@/server/actions/customer";
import styles from "./workspace.module.css";
import { inventoryPrintHtml } from "@/lib/inventory-print";
const money = (n: number) => "$" + n.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
const short = (id: string) => id.slice(-8).toUpperCase();
const tabs = [['sales', '銷貨單'], ['receipts', '收款單'], ['purchases', '進貨單'], ['products', '商品與庫存'], ['report', '銷貨報表'], ['suppliers', '廠商管理']] as const;
type Tab = typeof tabs[number][0];
type Panel = {type:"receiving";id?:string;cost?:boolean} | { type: "detail"; orderId: string } | {
    type: "order";
    kind: "SALE" | "PURCHASE";
    order?: InventoryOrderView;
} | {
    type: "payment";
    orders: InventoryOrderView[];
} | {
    type: "product";
    id?: string;
} | {
    type: "supplier";
    id?: string;
} | {
    type: "count";
} | null;
const Table = ({ headers, children }: {headers:string[];children:ReactNode}) => {
 const [page,setPage]=useState(1),rows=Children.toArray(children),pages=Math.max(1,Math.ceil(rows.length/50)),current=Math.min(page,pages);
 return <><div className={styles.table}><table><thead><tr>{headers.map(h=><th key={h} className={h==="操作"?styles.actions:/數量|庫存/.test(h)?styles.quantity:/金額|成本|毛利|售價/.test(h)?styles.number:undefined}>{h}</th>)}</tr></thead><tbody>{rows.slice((current-1)*50,current*50)}</tbody></table></div>{pages>1&&<div className={styles.toolbar}><button type="button" disabled={current===1} onClick={()=>setPage(current-1)}>上一頁</button><span>{current}/{pages}・共 {rows.length} 筆</span><button type="button" disabled={current===pages} onClick={()=>setPage(current+1)}>下一頁</button></div>}</>;
};
const More = ({ label, children }: {
    label: string;
    children: ReactNode;
}) => <ExclusiveMenu label={label} triggerText="⋯" quiet><div className={styles.menu}>{children}</div></ExclusiveMenu>;
function DateFilter({dates,onChange,label="單據"}:{dates:{from:string;to:string};onChange:(v:{from:string;to:string})=>void;label?:string}) {
 return <details className={styles.filterPopover}><summary>{dates.from||dates.to?`${dates.from||"不限"}～${dates.to||"不限"}`:"日期區間"}</summary><div className={styles.filterBody}><Field label="開始日期"><input type="date" aria-label={label+"開始日期"} value={dates.from} onChange={e=>onChange({...dates,from:e.target.value})}/></Field><Field label="結束日期"><input type="date" aria-label={label+"結束日期"} min={dates.from||undefined} value={dates.to} onChange={e=>onChange({...dates,to:e.target.value})}/></Field></div></details>;
}
const Field = ({ label, children }: {
    label: string;
    children: ReactNode;
}) => <label className={styles.field}><span>{label}</span>{children}</label>;
export function InventoryWorkspace({ initial }: {
    initial: InventoryData;
}) {
    const [data, setData] = useState(initial), [tab, setTab] = useState<Tab>("sales"), [queries, setQueries] = useState<Record<string, string>>({}), [filters, setFilters] = useState<Record<string, string>>({}), [panel, setPanel] = useState<Panel>(null), [pending, setPending] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [selected, setSelected] = useState<string[]>([]), [parties, setParties] = useState<Record<string, string>>({}), [daily, setDaily] = useState(false), [from, setFrom] = useState(toLocalDateStr().slice(0, 7) + "-01"), [to, setTo] = useState(toLocalDateStr());
    const [lastReceipt,setLastReceipt]=useState(""),[printing,setPrinting]=useState(false);
    const printBusy=useRef(false),activePrint=useRef<(()=>void)|null>(null);
    useEffect(()=>()=>{activePrint.current?.();},[]);
    const [receiptKind] = useState<"SALE" | "PURCHASE">("SALE");
    const [dateFilters, setDateFilters] = useState<Record<string, {from:string;to:string}>>({});
    const [detailId, setDetailId] = useState("");
    const [advanced,setAdvanced]=useState<Record<string,{category:string;brand:string;product:string;actor:string;delivery:string;status:string}>>({});
    const extra=advanced[tab]||{category:"",brand:"",product:"",actor:"",delivery:"",status:""};
    const setExtra=(v:typeof extra)=>setAdvanced(prev=>({...prev,[tab]:v}));
    const dates = dateFilters[tab] || {from:"",to:""};
    const setDates = (v: {from:string;to:string}) => setDateFilters(prev => ({...prev,[tab]:v}));
    const detailOrder = data.orders.find(o => o.id === (panel?.type === "detail" ? panel.orderId : detailId));
    const dirty = useRef(false), busy = useRef(false), requestId = useRef("");
    const query = queries[tab] || "";
    const filter = filters[tab] || "all", party = parties[tab] || "";
    const setFilter = (v: string) => setFilters(prev => ({ ...prev, [tab]: v }));
    const setParty = (v: string) => setParties(prev => ({ ...prev, [tab]: v }));
    const search = (value: string) => setQueries({ ...queries, [tab]: value });
    const open = (p: Panel) => { setLastReceipt(""); if(p?.type === "detail")setDetailId(p.orderId);else if(p?.type !== "payment" || !p.orders.some(o=>o.id===detailId))setDetailId(""); setError(""); dirty.current = false; requestId.current = crypto.randomUUID(); setPanel(p); };
    const close = () => { if (pending)
        return; if (dirty.current && !confirm("放棄尚未儲存的內容？"))
        return; setPanel(panel?.type === "payment" && detailId ? {type:"detail",orderId:detailId} : null); setError(""); dirty.current = false; };
    const run = async (work: () => Promise<{
        success: boolean;
        error?: string;
        data?: unknown;
    }>) => { let saved = false; if (busy.current)
        return; busy.current = true; setPending(true); setError(""); try {
        const result = await work();
        if (!result.success) {
            setError(result.error || "儲存失敗");
            return;
        }
        saved = true;
        dirty.current = false;
        const latest = await loadInventory();
        if (latest.success && latest.data) {
            setData(latest.data as InventoryData);
            if(panel?.type==="payment"&&panel.orders[0]?.kind==="SALE"&&typeof result.data==="string")setLastReceipt(result.data);
        }
        else
            setError("已儲存，但清單更新失敗；請重新整理");
        setPanel(detailId ? {type:"detail",orderId:detailId} : null);
        setSelected([]);
        setNotice("已儲存 ✓");
    }
    catch {
        if (saved) {
            setPanel(null);
            setSelected([]);
            setNotice("已儲存 ✓");
            setError("已儲存，但清單更新失敗；請重新整理");
        } else setError("連線失敗，請重試；重試不會重複入帳");
    }
    finally {
        busy.current = false;
        setPending(false);
    } };
    const orderKind = tab === "purchases" ? "PURCHASE" : "SALE";
    const orders = data.orders.filter(o => o.kind === orderKind);
    const shown = orders.filter(o => (tab!=="purchases"||!extra.status||(extra.status==="complete"&&(data.receivings||[]).some(r=>r.orderId===o.id))) && (!party || o.partyId === party) && (filter === "all" || (filter === "unpaid" ? o.total > o.paid : o.total === o.paid)) && (!extra.category||(o.priceCategory||"GENERAL")===extra.category)&&(!extra.brand||o.lines.some(l=>l.brand===extra.brand||data.products.find(p=>p.id===l.productId)?.brand===extra.brand))&&(!extra.product||o.lines.some(l=>l.productId===extra.product))&&(!extra.actor||o.actorName===extra.actor)&&(!extra.delivery||o.delivery===extra.delivery)&& (!dates.from || o.date >= dates.from) && (!dates.to || o.date <= dates.to) && [o.id, o.partyName, o.partyPhone, ...o.lines.map(l => [l.brand,l.name,l.specification].join(" "))].join(" ").toLowerCase().includes(query.toLowerCase()));
    const selectedShown = shown.filter(o => selected.includes(o.id) && o.total > o.paid);
    const unpaid = orders.filter(o => o.total > o.paid);
    const visibleTabs = tabs.filter(([v]) => (v==="purchases" ? data.canCost || data.canReceive : v==="report" ? data.canCost : true));
    const matchingReceipts = data.payments.filter(p=>p.kind==="SALE"&&(!dates.from||p.date>=dates.from)&&(!dates.to||p.date<=dates.to)&&(filter==="all"||p.method===filter)&&(!extra.actor||p.actorName===extra.actor));
    const receiptFilterActive=!!(dates.from||dates.to||filter!=="all"||extra.actor);
    const receiptOrders = data.orders.filter(o => o.partyId === party && o.kind === receiptKind);
    const receiptUnpaid = receiptOrders.filter(o => o.total > o.paid);
    const receiptCanPay = receiptKind === "PURCHASE" ? !!data.canPurchasePay : data.canWrite;
    const doc = (kind: string, id: string) => {
        if(printBusy.current)return;
        const html=inventoryPrintHtml(data,kind,id);if(!html){setError("找不到列印單據");return;}
        printBusy.current=true;setPrinting(true);
        const frame=document.createElement("iframe");frame.title="列印明細";frame.setAttribute("aria-hidden","true");
        frame.style.cssText="position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0";
        let timer:number;
        const cleanup=()=>{if(activePrint.current!==cleanup)return;frame.remove();printBusy.current=false;activePrint.current=null;setPrinting(false);window.clearTimeout(timer);};
        activePrint.current=cleanup;timer=window.setTimeout(()=>{cleanup();setError("列印準備逾時，請重試");},15000);
        frame.onload=async()=>{try{
            const target=frame.contentWindow;if(!target)throw Error("列印視窗無法開啟");
            await target.document.fonts.ready;await new Promise<void>(resolve=>target.requestAnimationFrame(()=>resolve()));
            if(activePrint.current!==cleanup)return;window.clearTimeout(timer);timer=window.setTimeout(cleanup,60000);target.addEventListener("afterprint",cleanup,{once:true});target.focus();target.print();
        }catch{cleanup();setError("列印無法開啟，請重試");}};
        frame.srcdoc=html;document.body.append(frame);
    };
    return <div className={styles.workspace}>
    <div className={styles.heading}><h1>進銷存</h1>{tab==="products"&&<div className={styles.toolbar}>{data.canManage && <button type="button" onClick={() => open({ type: "count" })}>庫存盤點</button>}{data.canExport && <a href={`/api/inventory/export?q=${encodeURIComponent(query)}&brand=${encodeURIComponent(extra.brand)}&status=${encodeURIComponent(extra.status)}`}>輸出 Excel</a>}</div>}{((tab === "sales" && data.canWrite) || (['products', 'suppliers'].includes(tab) && data.canManage) || (tab === 'purchases' && data.canManage && data.canCost)) && <button type="button" className={styles.primary} onClick={() => open(tab === "products" ? { type: "product" } : tab === "suppliers" ? { type: "supplier" } : { type: "order", kind: orderKind })}>＋ {tab === "products" ? "新增商品" : tab === "suppliers" ? "新增廠商" : tab === "purchases" ? "新增進貨" : "新增銷貨"}</button>}</div>
    <nav className={styles.tabs} aria-label="進銷存分類">{visibleTabs.map(([v, label]) => <button key={v} type="button" className={tab === v ? styles.active : ""} aria-pressed={tab === v} onClick={() => { setTab(v); setSelected([]); }}>{label}</button>)}</nav>
    {printing&&!panel&&<p role="status" className={styles.notice}>準備列印…</p>}
    {notice && <div className={styles.toolbar}><p className={styles.notice} role="status">{notice}</p>{lastReceipt&&<button type="button" className={styles.quiet} onClick={()=>doc("receipt",lastReceipt)}>列印本次收款</button>}</div>}{error && !panel && <p className={styles.error} role="alert">{error}</p>}
    {(tab === "sales" || tab === "purchases") && <>
      <div className={styles.unpaid}>未{tab === "sales" ? "收" : "付"}清 {unpaid.length} 筆・尚欠 {money(unpaid.reduce((n, o) => n + o.total - o.paid, 0))}</div>
      <div className={styles.filterRow}><input className={styles.search} type="search" aria-label="即時搜尋单據" placeholder="商品、姓名、電話或單號" value={query} onChange={e=>search(e.target.value)}/><DateFilter dates={dates} onChange={setDates}/><select className={styles.secondaryFilter} aria-label="批次收付款對象" value={party} onChange={e=>{setParty(e.target.value);setSelected([]);}}><option value="">全部{tab==="sales"?"顧客":"廠商"}</option>{[...new Map([...orders.map(o=>[o.partyId,{name:o.partyName,phone:o.partyPhone}] as const),...(tab==="purchases"?data.suppliers.map(s=>[s.id,s] as const):[]) ]).entries()].map(([id,p])=><option key={id} value={id}>{p.name}・{p.phone}</option>)}</select><select className={styles.secondaryFilter} aria-label="收付款狀態篩選" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部狀態</option><option value="unpaid">未付清</option><option value="paid">已付清</option></select><details className={styles.filterPopover}><summary>更多篩選{Object.values(extra).some(Boolean)?`・${Object.values(extra).filter(Boolean).length}`:""}</summary><div className={styles.filterBody}><div className={styles.narrowFilters}><select aria-label="篩選顧客或廠商" value={party} onChange={e=>{setParty(e.target.value);setSelected([]);}}><option value="">全部{tab==="sales"?"顧客":"廠商"}</option>{[...new Map([...orders.map(o=>[o.partyId,{name:o.partyName}] as const),...(tab==="purchases"?data.suppliers.map(s=>[s.id,s] as const):[])]).entries()].map(([id,p])=><option key={id} value={id}>{p.name}</option>)}</select><select aria-label="篩選付款狀態" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部狀態</option><option value="unpaid">未付清</option><option value="paid">已付清</option></select></div>{tab==="sales"&&<select aria-label="身份價格篩選" value={extra.category} onChange={e=>setExtra({...extra,category:e.target.value})}><option value="">全部身份價格</option>{Object.entries(priceCategories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>}<select aria-label="品牌篩選" value={extra.brand} onChange={e=>setExtra({...extra,brand:e.target.value})}><option value="">全部品牌</option>{[...new Set(data.products.map(p=>p.brand).filter(Boolean))].map(brand=><option key={brand}>{brand}</option>)}</select><select aria-label="商品篩選" value={extra.product} onChange={e=>setExtra({...extra,product:e.target.value})}><option value="">全部商品</option>{data.products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="經手人篩選" value={extra.actor} onChange={e=>setExtra({...extra,actor:e.target.value})}><option value="">全部經手人</option>{[...new Set([...orders.map(o=>o.actorName),...(tab==="purchases"?(data.receivings||[]).map(r=>r.actorName):[])].filter(Boolean))].map(name=><option key={name}>{name}</option>)}</select>{tab==="sales"?<select aria-label="交貨方式篩選" value={extra.delivery} onChange={e=>setExtra({...extra,delivery:e.target.value})}><option value="">全部交貨方式</option><option>自取</option><option>寄送</option></select>:<select aria-label="收貨狀態篩選" value={extra.status} onChange={e=>setExtra({...extra,status:e.target.value})}><option value="">全部收貨狀態</option><option value="partial">部分到貨</option><option value="pending">待補資料</option><option value="complete">資料完整</option></select>}</div></details><button className={styles.quiet} type="button" onClick={()=>{setExtra({category:"",brand:"",product:"",actor:"",delivery:"",status:""});setDates({from:"",to:""});setFilter("all");setParty("");search("");setSelected([]);}}>清除篩選</button>{party&&<button type="button" disabled={!selectedShown.length||!(tab==="sales"?data.canWrite:data.canPurchasePay)} onClick={()=>open({type:"payment",orders:selectedShown})}>批次{tab==="sales"?"收款":"付款"}（{selectedShown.length}）</button>}</div>
    {tab === "purchases" && <><div className={styles.toolbar}>{data.canReceive && <button className={styles.primary} type="button" onClick={()=>{setDetailId("");open({type:"receiving"});}}>＋ 登錄收貨</button>}<button type="button" className={styles.quiet} onClick={()=>setExtra({...extra,status:extra.status==="pending"?"":"pending"})} aria-pressed={extra.status==="pending"}>待補資料 {(data.receivings||[]).filter(r=>!r.orderId).length} 筆</button></div>
    <Table headers={["日期／收貨單","廠商","品項／到貨數量","狀態","操作"]}>{(data.receivings||[]).filter(r=>(!extra.brand||r.lines.some(l=>data.products.find(p=>p.id===l.productId)?.brand===extra.brand))&&(!extra.product||r.lines.some(l=>l.productId===extra.product))&&(!extra.status||(extra.status==="partial"?r.lines.some(l=>l.received<l.expected):extra.status==="pending"?!r.orderId:!!r.orderId))&&(!extra.actor||r.actorName===extra.actor)&&(!party||r.supplierId===party)&&(!dates.from||r.date>=dates.from)&&(!dates.to||r.date<=dates.to)&&[r.id,r.supplierName,r.deliveryNumber,...r.lines.map(l=>l.name)].join(" ").toLowerCase().includes(query.toLowerCase())).map(r=><tr key={r.id}><td>{r.date}<span className={styles.sub}>{short(r.id)}</span></td><td>{r.supplierName||"待補廠商"}{r.deliveryNumber&&<span className={styles.sub}>送貨單 {r.deliveryNumber}</span>}</td><td><details className={styles.lineSummary}><summary>{r.lines[0]?.name}・{r.lines[0]?.received}/{r.lines[0]?.expected}{r.lines.length>1?`・共 ${r.lines.length} 項`:""}</summary>{r.lines.map(l=><div key={l.productId}>{l.name}・{l.received}/{l.expected}</div>)}</details></td><td>{r.orderId?"資料完整":r.lines.some(l=>l.received<l.expected)?"部分到貨・待補資料":"已入庫・待補成本"}</td><td className={styles.actions}><More label={short(r.id)+" 更多操作"}>{!r.orderId&&data.canReceive&&<button type="button" onClick={()=>open({type:"receiving",id:r.id})}>收貨／更正數量</button>}{!r.orderId&&data.canCost&&data.canManage&&<button type="button" onClick={()=>open({type:"receiving",id:r.id,cost:true})}>補廠商與成本</button>}{r.orderId&&data.canCost&&<button type="button" onClick={()=>{setDetailId(r.orderId!);open({type:"detail",orderId:r.orderId!});}}>進貨明細</button>}</More></td></tr>)}</Table></>}

      <p className={styles.sub}>符合條件共 {shown.length} 筆</p><Table headers={["選取", "日期／單號", tab === "sales" ? "顧客" : "廠商", "品項", tab==="sales"?"應收金額":"應付金額", tab==="sales"?"已收金額":"已付金額", "尚欠金額", "操作"]}>{shown.map(o => <tr key={o.id} className={styles.clickable} onClick={e => { if ((e.target as HTMLElement).closest("button,input,a")) return; setDetailId(o.id); open({type:"detail",orderId:o.id}); }}><td><input type="checkbox" aria-label={`選取 ${short(o.id)}`} disabled={!party || o.paid === o.total || !(tab === "sales" ? data.canWrite : data.canPurchasePay)} checked={selected.includes(o.id)} onChange={e => setSelected(e.target.checked ? [...selected, o.id] : selected.filter(id => id !== o.id))}/></td><td className={styles.documentCell}>{o.date} <span className={styles.muted}>{short(o.id)}</span></td><td className={styles.partyCell}>{o.partyName} <span className={styles.muted}>{o.partyPhone}</span></td><td><span className={styles.ellipsis}>{o.lines.slice(0,1).map(l=>`${l.brand?l.brand+"・":""}${l.name} × ${l.quantity}${l.gift?"・贈品":""}`).join("、")}{o.lines.length>1?`・共 ${o.lines.length} 項`:""}</span></td><td className={styles.number}>{money(o.total)}</td><td className={styles.number}>{money(o.paid)}</td><td className={styles.number}>{o.total > o.paid ? <span className={styles.unpaid}>{money(o.total - o.paid)}</span> : "已付清"}</td><td className={styles.actions}><div className={styles.actionGroup}><More label={`${short(o.id)} 更多操作`}>{tab === "sales" && data.canWrite && <button type="button" onClick={() => open({ type: "order", kind: "SALE", order: o })}>編輯銷貨單</button>}{tab === "sales" && <button type="button" onClick={() => doc("sale", o.id)}>列印銷貨明細</button>}<button type="button" onClick={() => { setDetailId(o.id); open({type:"detail",orderId:o.id}); }}>收付款紀錄</button><OperationHistoryButton targetType="InventoryOrder" targetId={o.id}/></More></div></td></tr>)}</Table>{!shown.length && <div className={styles.empty}>沒有符合條件的資料</div>}
    </>}
    {tab === "receipts" && <>
      <div className={styles.filterRow}><input type="search" className={styles.search} placeholder="姓名、電話、商品或單號" aria-label="顧客姓名或電話" value={query} onChange={e=>{search(e.target.value);setParty("");}}/><DateFilter label="收款" dates={dates} onChange={setDates}/><select aria-label="收款方式篩選" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部收款方式</option><option>現金</option><option>轉帳</option><option>其他</option></select><details className={styles.filterPopover}><summary>更多篩選{extra.actor?"・1":""}</summary><div className={styles.filterBody}><select aria-label="收款人篩選" value={extra.actor} onChange={e=>setExtra({...extra,actor:e.target.value})}><option value="">全部收款人</option>{[...new Set(data.payments.filter(p=>p.kind==="SALE").map(p=>p.actorName).filter(Boolean))].map(name=><option key={name}>{name}</option>)}</select></div></details><button className={styles.quiet} type="button" onClick={()=>{setDates({from:"",to:""});setFilter("all");setExtra({category:"",brand:"",product:"",actor:"",delivery:"",status:""});search("");}}>清除篩選</button></div>
      {!party ? <Table headers={["顧客／電話","尚欠金額","操作"]}>{data.customers.filter(c => (!receiptFilterActive||matchingReceipts.some(p=>p.partyId===c.id)) && (query || data.orders.some(o => o.kind === "SALE" && o.partyId === c.id)) && [c.name, c.phone,...data.orders.filter(o=>o.kind==="SALE"&&o.partyId===c.id).flatMap(o=>[o.id,...o.lines.map(l=>[l.brand,l.name,l.specification].join(" "))]),...data.payments.filter(p=>p.kind==="SALE"&&p.partyId===c.id).map(p=>p.id)].join(" ").toLowerCase().includes(query.toLowerCase())).map(c => {const balance=data.orders.filter(o=>o.kind==="SALE"&&o.partyId===c.id).reduce((n,o)=>n+o.total-o.paid,0);return <tr key={c.id} className={styles.clickable} onClick={()=>setParty(c.id)}><td>{c.name}<span className={styles.sub}>{c.phone}</span></td><td className={styles.number}>{money(balance)}</td><td className={styles.actions}><button type="button" className={styles.quiet} aria-label={c.name+" "+c.phone+" 收款紀錄"} onClick={()=>setParty(c.id)}>查看</button></td></tr>;})}</Table> : <>
        <button type="button" onClick={() => setParty("")}>{receiptKind === "SALE" ? "更換顧客" : "更換廠商"}</button>
        <h2>{(receiptKind === "SALE" ? data.customers : data.suppliers).find(c => c.id === party)?.name}</h2>
        <div className={styles.toolbar}><button type="button" disabled={!receiptCanPay || !receiptUnpaid.length} onClick={() => open({ type: "payment", orders: receiptUnpaid })}>{receiptKind === "SALE" ? "收取未付款" : "支付未付款"}</button></div>
        <Table headers={[receiptKind === "SALE" ? "日期／銷貨單" : "日期／進貨單", "購物明細", receiptKind === "SALE" ? "應收金額" : "應付金額", receiptKind === "SALE" ? "已收金額" : "已付金額", "尚欠金額"]}>{receiptOrders.map(o => <tr key={o.id} className={styles.clickable} onClick={()=>open({type:"detail",orderId:o.id})}><td>{o.date}・{short(o.id)}</td><td>{o.lines.map(l => `${l.name} × ${l.quantity}${l.gift ? '（贈品）' : ''}`).join('、')}</td><td className={styles.number}>{money(o.total)}</td><td className={styles.number}>{money(o.paid)}</td><td className={styles.number}>{money(o.total - o.paid)}</td></tr>)}</Table>
        <h2>收款紀錄</h2><p className={styles.sub}>符合條件共 {matchingReceipts.filter(p=>p.partyId===party).length} 筆</p><Table headers={["日期／單號", "收款方式", "收款人", "金額", "操作"]}>{matchingReceipts.filter(p => p.partyId === party).map(p => <tr key={p.id}><td>{p.date}・{short(p.id)}</td><td>{p.method}</td><td>{p.actorName||"—"}</td><td className={styles.number}>{money(p.total)}</td><td className={styles.actions}>{p.kind === "SALE" && <button type="button" onClick={() => doc("receipt", p.id)}>列印收款明細</button>}</td></tr>)}</Table>
      </>}
    </>}
    {tab === "products" && <><div className={styles.filterRow}><input type="search" className={styles.search} placeholder="商品、品牌、規格或編號" aria-label="搜尋商品" value={query} onChange={e => search(e.target.value)}/><select aria-label="商品品牌篩選" value={extra.brand} onChange={e=>setExtra({...extra,brand:e.target.value})}><option value="">全部品牌</option>{[...new Set(data.products.map(p=>p.brand).filter(Boolean))].map(brand=><option key={brand}>{brand}</option>)}</select><button className={styles.quiet} type="button" onClick={()=>{search("");setExtra({...extra,brand:"",status:""});}}>清除篩選</button><select aria-label="商品狀態篩選" value={extra.status} onChange={e=>setExtra({...extra,status:e.target.value})}><option value="">全部狀態</option><option value="active">使用中</option><option value="inactive">已停用</option><option value="low">低庫存</option></select></div><Table headers={["商品", "庫存數量", ...(data.canCost ? ["平均成本"] : []), "預設售價", "操作"]}>{data.products.filter(p => (!extra.status||(extra.status==="active"?p.active:extra.status==="inactive"?!p.active:p.stock<(p.minimumStock||0)))&&(!extra.brand||p.brand===extra.brand)&&productSearch(p,query)).map(p => <tr key={p.id}><td><details className={styles.productSummary}><summary>{p.brand&&<span className={styles.muted}>{p.brand}・</span>}{p.name}{p.specification&&`・${p.specification}`}</summary><p>{[p.brand,p.name,p.specification].filter(Boolean).join("・")}・單位 {p.unit||"件"}{p.code&&`・編號 ${p.code}`}</p></details>{!p.active && <span className={styles.sub}>已停用</span>}</td><td className={styles.quantity}>{p.stock}{p.minimumStock!==undefined&&p.stock<p.minimumStock&&<span className={styles.attention}>・低庫存</span>}</td>{data.canCost && <td className={styles.number}>{p.costPending?"待確認":money(p.averageCost || 0)}</td>}<td className={styles.number}>{money(p.price)}</td><td className={styles.actions}><More label={p.name + " 更多操作"}>{data.canManage && <button type="button" onClick={() => open({ type: "product", id: p.id })}>編輯商品</button>}<OperationHistoryButton targetType="InventoryProduct" targetId={p.id}/></More></td></tr>)}</Table><h2>盤點紀錄</h2>{data.counts.map(c => <details key={c.id}><summary>{c.date}・{c.actorName}・{c.reason}・{c.lines.length} 個品項</summary><p>儲存時間：{new Date(c.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</p><Table headers={["商品", "帳面庫存", "實際數量", "差異數量"]}>{c.lines.map(l => <tr key={l.productId}><td>{l.name}</td><td className={styles.quantity}>{l.before}</td><td className={styles.quantity}>{l.actual}</td><td className={styles.quantity}>{l.difference}</td></tr>)}</Table></details>)}</>}
    {tab === "suppliers" && <><div className={styles.filterRow}><input className={styles.search} type="search" placeholder="即時搜尋廠商、窗口或電話" aria-label="搜尋廠商" value={query} onChange={e => search(e.target.value)}/></div><Table headers={["廠商", "負責窗口", "電話", "地址", ...(data.canCost ? ["尚欠金額"] : []), "操作"]}>{data.suppliers.filter(s => [s.name, s.contact, s.phone].join(' ').includes(query)).map(s => <tr key={s.id}><td>{s.name}{!s.active && <span className={styles.sub}>已停用</span>}</td><td>{s.contact}</td><td>{s.phone}</td><td>{s.address}</td>{data.canCost && <td className={styles.number}>{money(data.orders.filter(o => o.kind === "PURCHASE" && o.partyId === s.id).reduce((n, o) => n + o.total - o.paid, 0))}</td>}<td className={styles.actions}><More label={s.name + " 更多操作"}>{data.canManage && <button type="button" onClick={() => open({ type: "supplier", id: s.id })}>編輯廠商</button>}<OperationHistoryButton targetType="InventorySupplier" targetId={s.id!}/></More></td></tr>)}</Table></>}
    {tab === "report" && data.canCost && (() => { const rows = inventoryReport(data.orders, from, to, daily).filter(r => r.name.includes(query)), costPending=rows.some(r=>r.costPending), total = rows.reduce((n, r) => n + r.total, 0), cost = rows.reduce((n, r) => n + r.cost, 0); return <><div className={styles.filterRow}><DateFilter label="報表" dates={{from,to}} onChange={v=>{setFrom(v.from);setTo(v.to);}}/><button type="button" className={!daily ? styles.active : ""} onClick={() => setDaily(false)}>品項彙總</button><button type="button" className={daily ? styles.active : ""} onClick={() => setDaily(true)}>每日明細</button><input className={styles.search} type="search" aria-label="篩選報表商品" placeholder="即時篩選商品" value={query} onChange={e => search(e.target.value)}/></div><div className={styles.stats}>{[["實際售出金額", money(total)], ["銷貨成本", costPending?"成本待確認":money(cost)], ["毛利", costPending?"待確認":money(total - cost)], ["毛利率", costPending?"待確認":total ? ((total - cost) / total * 100).toFixed(1) + '%' : '—']].map(([label, v]) => <div key={label}>{label}<strong>{v}</strong></div>)}</div><Table headers={[...(daily ? ["日期"] : []), "商品", "售出數量", "贈送數量", "實際售出金額", "成本", "毛利", "毛利率"]}>{rows.map((r, i) => <tr key={i}>{daily && <td>{r.date}</td>}<td>{r.name}</td><td className={styles.quantity}>{r.sold}</td><td className={styles.quantity}>{r.gifts}</td><td className={styles.number}>{money(r.total)}</td><td className={styles.number}>{r.costPending?"待確認":money(r.cost)}</td><td className={styles.number}>{r.costPending?"待確認":money(r.profit)}</td><td className={styles.number}>{r.costPending?"待確認":r.margin === null ? '—' : r.margin.toFixed(1) + '%'}</td></tr>)}</Table></>; })()}
    <ModalPanel open={!!panel} onClose={close} labelledById="inventory-editor-title" pending={pending} width={panel?.type==="product"||panel?.type==="supplier"?720:1100}><div className={`${styles.workspace} ${styles.editor}`}><div className={styles.heading}><h2 id="inventory-editor-title">{panel?.type === "receiving" ? (panel.cost?"補齊進貨資料":"收貨入庫") : panel?.type === "detail" ? "單據明細" : panel?.type === "order" ? (panel.order ? '編輯销貨單' : panel.kind === "SALE" ? '新增銷貨' : '新增進貨') : panel?.type === "payment" ? '收付款' : panel?.type === "product" ? '商品資料' : panel?.type === "supplier" ? '廠商資料' : '庫存盤點'}</h2><button type="button" disabled={pending} onClick={close}>關閉</button></div>{printing&&<p role="status" className={styles.notice}>準備列印…</p>}{panel?.type === "detail" && detailOrder && <><p>{detailOrder.date}・{short(detailOrder.id)}・{detailOrder.partyName}・{detailOrder.partyPhone}</p><Table headers={["商品","數量","金額"]}>{detailOrder.lines.map(l=><tr key={l.productId}><td>{[l.brand,l.name,l.specification].filter(Boolean).join("・")}{l.gift?"・贈品":""}</td><td className={styles.quantity}>{l.quantity}</td><td className={styles.number}>{money(l.total)}</td></tr>)}</Table><div className={styles.stats}><span>應{detailOrder.kind==="SALE"?"收":"付"} {money(detailOrder.total)}</span><span>已{detailOrder.kind==="SALE"?"收":"付"} {money(detailOrder.paid)}</span><strong>尚欠 {money(detailOrder.total-detailOrder.paid)}</strong></div><h3>{detailOrder.kind==="SALE"?"收款":"付款"}紀錄</h3><Table headers={["日期／單號","付款方式","金額","操作"]}>{data.payments.filter(p=>p.kind===detailOrder.kind&&p.allocations.some(a=>a.orderId===detailOrder.id)).map(p=><tr key={p.id}><td>{p.date}・{short(p.id)}</td><td>{p.method}</td><td className={styles.number}>{money(p.allocations.find(a=>a.orderId===detailOrder.id)!.amount)}</td><td className={styles.actions}>{p.kind==="SALE"&&<More label={short(p.id)+" 更多操作"}><button type="button" onClick={()=>doc("receipt",p.id)}>列印收款明細</button></More>}</td></tr>)}</Table>{!data.payments.some(p=>p.allocations.some(a=>a.orderId===detailOrder.id))&&<p className={styles.empty}>尚無{detailOrder.kind==="SALE"?"收款":"付款"}紀錄</p>}<div className={styles.footer}>{detailOrder.kind==="SALE"&&<button type="button" onClick={()=>doc("sale",detailOrder.id)}>列印銷貨明細</button>}{detailOrder.total>detailOrder.paid&&(detailOrder.kind==="SALE"?data.canWrite:data.canPurchasePay)&&<button type="button" className={styles.primary} onClick={()=>open({type:"payment",orders:[detailOrder]})}>{detailOrder.kind==="SALE"?"收款":"付款"}</button>}</div></>}
    {panel?.type === "receiving" && <ReceivingEditor key={requestId.current} data={data} panel={panel} requestId={requestId.current} pending={pending} onDirty={()=>{dirty.current=true;}} run={run}/>}
    {panel && panel.type !== "detail" && panel.type !== "receiving" && <Editor key={requestId.current} panel={panel} data={data} pending={pending} requestId={requestId.current} onDirty={() => { dirty.current = true; }} run={run} onData={setData}/>}<p className={styles.error} role="alert">{error}</p></div></ModalPanel>
  </div>;
}
function Editor({ panel, data, pending, requestId, onDirty, run, onData }: {
    panel: Exclude<NonNullable<Panel>,{type:"detail"}|{type:"receiving"}>;
    data: InventoryData;
    pending: boolean;
    requestId: string;
    onDirty: () => void;
    run: (work: () => Promise<{
        success: boolean;
        error?: string;
    }>) => Promise<void>;
    onData: (data: InventoryData) => void;
}) {
    const order = panel.type === "order" ? panel.order : undefined;
    const [lines, setLines] = useState<LineInput[]>(order?.lines.map(l => ({ ...l })) || []), [query, setQuery] = useState(""), [partyId, setPartyId] = useState(order?.partyId || ""), [partyQuery, setPartyQuery] = useState(""), [delivery, setDelivery] = useState(order?.delivery || "自取"), [freight, setFreight] = useState(order?.freight || 0), [method, setMethod] = useState(panel.type === "order" && panel.kind === "PURCHASE" ? "未付款" : "現金"), [manualPaid, setManualPaid] = useState<number | null>(null), [newCustomer, setNewCustomer] = useState(false), [customerError, setCustomerError] = useState(""), [creating, setCreating] = useState(false);
    const kind = panel.type === "order" ? panel.kind : "SALE";
    const supplier = panel.type === "supplier" ? data.suppliers.find(s => s.id === panel.id) : undefined;
    const product = panel.type === "product" ? data.products.find(p => p.id === panel.id) : undefined;
    const [amounts, setAmounts] = useState<Record<string, number>>(panel.type === "payment" ? Object.fromEntries(panel.orders.map(o => [o.id, o.total - o.paid])) : {});
    const [priceCategory,setPriceCategory]=useState<PriceCategory>(order?.priceCategory||"GENERAL");
    const lastPurchase=product&&data.canCost?data.orders.find(o=>o.kind==="PURCHASE"&&o.lines.some(l=>l.productId===product.id)):undefined;
    const [productPrice,setProductPrice]=useState(product?.price||0);
    const [ratios,setRatios]=useState(product?.priceRatios||{});
    const manuallyPriced=useRef(new Set<string>((order?.lines||[]).filter(l=>l.unitPrice!==categoryPrice(data.products.find(p=>p.id===l.productId)||{price:l.unitPrice},order?.priceCategory||"GENERAL")).map(l=>l.productId)));
    const changeCategory=(next:PriceCategory)=>{if(next===priceCategory)return;if((manuallyPriced.current.size||lines.some(l=>l.discountMode!=="NONE"||l.discount||l.gift))&&!confirm("切換身份價格將重新計算單價並清除額外優惠，是否繼續？"))return;setPriceCategory(next);setLines(lines.map(l=>({...l,unitPrice:categoryPrice(data.products.find(p=>p.id===l.productId)||{price:l.unitPrice},next),discountMode:"NONE",discount:0,gift:false})));manuallyPriced.current.clear();onDirty();};
    const [counts, setCounts] = useState<Record<string, string>>({});
    const update = (i: number, v: Partial<LineInput>) => { setLines(lines.map((l, j) => i === j ? { ...l, ...v } : l)); onDirty(); };
    let total = 0;
    try {
        total = lines.reduce((n, l) => n + lineTotal(l, kind), 0) + (delivery === "寄送" ? freight : 0);
    }
    catch {
        total = 0;
    }
    return <form onChange={onDirty} onSubmit={e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget), text = (k: string) => String(f.get(k) || ""), num = (k: string) => Number(f.get(k) || 0);
            if (panel.type === "order")
                void run(() => saveOrder({ requestId, id: order?.id, revision: order?.revision, kind, priceCategory, date: text('date'), partyId, lines, paid: order ? order.paid : method === "未付款" ? 0 : num('paid'), method, delivery, channel: text('channel'), freight: delivery === "寄送" ? freight : 0, shippingNote: text('shippingNote'), internalNote: text('internalNote') }));
            if (panel.type === "payment")
                void run(() => savePayment({ requestId, kind: panel.orders[0].kind, date: text('date'), method: text('method'), allocations: panel.orders.filter(o => amounts[o.id] > 0).map(o => ({ orderId: o.id, amount: amounts[o.id] })) }));
            if (panel.type === "product")
                void run(() => saveProduct({ id: product?.id, revision: product?.revision, name: text('name'), price: num('price'), stock: num('stock'), averageCost: num('cost'), details:{brand:text('brand'),specification:text('specification'),unit:text('unit'),code:text('code'),barcode:text('barcode'),minimumStock:num('minimumStock'),note:text('note'),priceRatios:ratios}, active: f.get('active') === 'on' }));
            if (panel.type === "supplier")
                void run(() => saveSupplier({ id: supplier?.id, name: text('name'), contact: text('contact'), phone: text('phone'), address: text('address'), active: f.get('active') === 'on' }));
            if (panel.type === "count")
                void run(() => saveStockCount({ requestId, date: text('date'), reason: text('reason'), lines: data.products.filter(p => counts[p.id] !== undefined && counts[p.id] !== '').map(p => ({ productId: p.id, revision: p.revision, actual: Number(counts[p.id]) })) }));
        }}>
    {(panel.type === "order" || panel.type === "payment" || panel.type === "count") && <div className={`${styles.meta} ${panel.type==="order"&&kind==="SALE"?styles.orderMeta:""}`}><Field label="日期"><input type="date" name="date" defaultValue={order?.date || toLocalDateStr()} required/></Field>{panel.type === "order" && <Field label={kind === "SALE" ? '顧客・必選' : '廠商・必選'}>{partyId ? <div className={styles.toolbar}><span>{(kind === "SALE" ? data.customers : data.suppliers).find(c => c.id === partyId)?.name}・{(kind === "SALE" ? data.customers : data.suppliers).find(c => c.id === partyId)?.phone}</span>{!order && <button type="button" onClick={() => setPartyId("")}>更換</button>}</div> : <><input type="search" aria-label="即時搜尋姓名或電話" placeholder="搜尋姓名或電話" value={partyQuery} onChange={e => setPartyQuery(e.target.value)}/>{partyQuery && <div className={styles.results}>{(kind === "SALE" ? data.customers : data.suppliers.filter(s => s.active)).filter(c => [c.name, c.phone].join(' ').includes(partyQuery)).map(c => <button type="button" key={c.id} onClick={() => { setPartyId(c.id); onDirty(); }}>{c.name}・{c.phone}</button>)}</div>}</>}</Field>}{panel.type==="order"&&kind==="SALE"&&<Field label="身份價格"><select aria-label="身份價格" value={priceCategory} onChange={e=>changeCategory(e.target.value as PriceCategory)}>{Object.entries(priceCategories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>}</div>}
    {panel.type === "order" && <>{kind === "SALE" && data.canCreateCustomer && !order && <><button type="button" onClick={() => setNewCustomer(!newCustomer)}>＋ 新增顧客</button>{newCustomer && <div className={styles.fields}><Field label="姓名"><input name="newName"/></Field><Field label="電話"><input name="newPhone" type="tel"/></Field><button type="button" disabled={creating} onClick={async (e) => { if (creating)
            return; setCreating(true); try {
            const form = e.currentTarget.form!, res = await createCustomer({ name: (form.elements.namedItem('newName') as HTMLInputElement).value, phone: (form.elements.namedItem('newPhone') as HTMLInputElement).value });
            if (!res.success) {
                setCustomerError(res.error || '建立失敗');
                return;
            }
            const latest = await loadInventory();
            if (latest.success && latest.data) {
                onData(latest.data as InventoryData);
                setPartyId(res.data!.customerId);
                setNewCustomer(false);
            }
        }
        finally {
            setCreating(false);
        } }}>建立並選用</button><span className={styles.error}>{customerError}</span></div>}</>}
      <input type="search" placeholder="搜尋商品，點選即可加入" aria-label="即時篩選商品" value={query} onChange={e => setQuery(e.target.value)}/>{query && <div className={styles.results}>{data.products.filter(p => p.active && productSearch(p,query)).map(p => <button type="button" key={p.id} onClick={() => { const i = lines.findIndex(l => l.productId === p.id); if (i >= 0)
            update(i, { quantity: lines[i].quantity + 1 });
        else
            setLines([...lines, { productId: p.id, quantity: 1, unitPrice: kind === "SALE" ? categoryPrice(p,priceCategory) : Math.round(p.averageCost || 0), discountMode: "NONE", discount: 0, gift: false }]); onDirty(); }}>{p.name}・庫存 {p.stock}・{money(p.price)}　＋ 加入</button>)}</div>}
      <div className={`${styles.table} ${styles.lines}`}><table><thead><tr>{['商品', '庫存', '數量', kind === "SALE" ? '單價' : '進貨成本', ...(kind === "SALE" ? ['折扣方式', '折扣', '贈品'] : []), '實際小計', '操作'].map(h => <th key={h} className={/庫存|數量/.test(h)?styles.quantity:/單價|成本|小計/.test(h)?styles.number:h==="操作"?styles.actions:undefined}>{h}</th>)}</tr></thead><tbody>{lines.map((l, i) => { const p = data.products.find(p => p.id === l.productId); let amount = 0; try {
            amount = lineTotal(l, kind);
        }
        catch { } return <tr key={l.productId}><td>{p?.brand&&<span className={styles.muted}>{p.brand}・</span>}{p?.name}{p?.specification&&`・${p.specification}`}</td><td className={styles.quantity}>{p?.stock}</td><td><input aria-label={`${p?.name} 數量`} type="number" min="1" step="1" value={l.quantity} onChange={e => update(i, { quantity: Number(e.target.value) })} required/></td><td><input aria-label={`${p?.name} ${kind === "SALE" ? '單價' : '進貨成本'}`} type="number" min="0" step="1" value={l.unitPrice} readOnly={kind==="SALE"&&!data.canPriceOverride} onChange={e => {manuallyPriced.current.add(l.productId);update(i, { unitPrice: Number(e.target.value) });}} required/></td>{kind === "SALE" && <><td><select aria-label={`${p?.name} 折扣方式`} disabled={l.gift||!data.canPriceOverride} value={l.discountMode} onChange={e => update(i, { discountMode: e.target.value as LineInput['discountMode'], discount: 0 })}><option value="NONE">無折扣</option><option value="AMOUNT">折抵金額</option><option value="PERCENT">折扣 %</option></select></td><td><input aria-label={`${p?.name} 折扣`} type="number" min="0" max={l.discountMode === "PERCENT" ? 100 : undefined} disabled={l.gift || l.discountMode === "NONE"||!data.canPriceOverride} value={l.discount} onChange={e => update(i, { discount: Number(e.target.value) })}/></td><td className={styles.quantity}><input type="checkbox" aria-label={`${p?.name} 贈品`} disabled={!data.canPriceOverride} checked={l.gift} onChange={e => update(i, { gift: e.target.checked })}/></td></>}<td className={styles.number}>{money(amount)}</td><td><button type="button" onClick={() => { setLines(lines.filter((_, j) => i !== j)); onDirty(); }}>移除</button></td></tr>; })}</tbody></table></div>
      {kind === "SALE" && <div className={styles.delivery}><Field label="交貨方式"><select value={delivery} onChange={e => setDelivery(e.target.value)}><option>自取</option><option>寄送</option></select></Field>{delivery === "寄送" && <><Field label="寄送管道"><select name="channel" defaultValue={order?.channel || ''} required><option value="">請選擇</option>{['超商', '蝦皮', '貨運', '其他'].map(s => <option key={s}>{s}</option>)}</select></Field><Field label="運費（顧客）"><input type="number" min="0" step="1" value={freight} onChange={e => setFreight(Number(e.target.value))}/></Field><Field label="寄送備註（列印）"><input name="shippingNote" placeholder="收件人、電話、地址／超商門市" defaultValue={order?.shippingNote}/></Field></>}</div>}
      <div className={styles.payment}><Field label={order ? '累計已收款' : '本次收付款金額'}><input type="number" name="paid" min="0" step="1" max={total} value={order ? order.paid : method === "未付款" ? 0 : manualPaid ?? total} onChange={e => setManualPaid(Number(e.target.value))} disabled={!!order || method === "未付款" || (kind === "PURCHASE" && !data.canPurchasePay)} required/></Field><Field label="收付款"><select value={method} onChange={e => setMethod(e.target.value)} disabled={!!order || (kind === "PURCHASE" && !data.canPurchasePay)}>{['現金', '轉帳', '其他', '未付款'].map(v => <option key={v}>{v}</option>)}</select></Field><Field label="內部備註（不列印）"><input name="internalNote" defaultValue={order?.internalNote}/></Field></div><div className={styles.footer}><strong>應收／應付金額 {money(total)}</strong><button type="submit" className={styles.primary} disabled={pending || !partyId || !lines.length}>{pending ? '儲存中…' : order ? '儲存修改' : kind === "SALE" ? '完成銷貨' : '完成進貨'}</button></div>
    </>}
    {panel.type === "payment" && <><Field label="付款方式"><select name="method" defaultValue={data.payments.find(p=>p.kind===panel.orders[0].kind&&p.partyId===panel.orders[0].partyId)?.method||"現金"}><option>現金</option><option>轉帳</option><option>其他</option></select></Field><div className={styles.table}><table><thead><tr><th>單號</th><th>尚欠金額</th><th>本次收付款</th><th>完成後尚欠</th></tr></thead><tbody>{panel.orders.map(o => <tr key={o.id}><td>{short(o.id)}</td><td>{money(o.total - o.paid)}</td><td><input aria-label={`${short(o.id)} 收付款金額`} type="number" min="0" step="1" max={o.total - o.paid} value={amounts[o.id]} onChange={e => setAmounts({ ...amounts, [o.id]: Number(e.target.value) })} required/></td><td className={styles.number}>{money(o.total-o.paid-(amounts[o.id]||0))}</td></tr>)}</tbody></table></div><div className={styles.footer}><strong>本次金額 {money(Object.values(amounts).reduce((a, b) => a + b, 0))}</strong><button type="submit" className={styles.primary} disabled={pending || !Object.values(amounts).some(v=>v>0)}>{pending?"儲存中…":panel.orders[0].kind==="SALE"?"完成收款":"完成付款"}</button></div></>}
    {panel.type === "product" && <><div className={styles.fields}><Field label="商品名稱"><input name="name" defaultValue={product?.name} maxLength={200} required/></Field><Field label="品牌・選填"><input name="brand" defaultValue={product?.brand} maxLength={100}/></Field><Field label="規格／型號・選填"><input name="specification" defaultValue={product?.specification} maxLength={200}/></Field><Field label="單位"><input name="unit" defaultValue={product?.unit||"件"} maxLength={30} required/></Field><Field label="一般售價"><input name="price" type="number" min="0" step="1" value={productPrice} onChange={e=>setProductPrice(Number(e.target.value))} required/></Field><Field label="最低庫存・選填"><input name="minimumStock" type="number" min="0" step="1" defaultValue={product?.minimumStock||0}/></Field>{product?<><Field label="目前庫存"><span>{product.stock} {product.unit||"件"}・調整請使用庫存盤點</span></Field>{data.canCost&&<Field label="平均成本"><span>{product.costPending?"待確認":money(product.averageCost||0)}</span></Field>}{lastPurchase&&<Field label="最近進貨"><span>{lastPurchase.partyName}・{money(lastPurchase.lines.find(l=>l.productId===product!.id)!.unitPrice)}・{lastPurchase.date}</span></Field>}</>:data.canCost&&<><Field label="初始庫存"><input name="stock" type="number" min="0" step="1" defaultValue={0}/></Field><Field label="初始平均成本"><input name="cost" type="number" min="0" step="0.01" defaultValue={0}/></Field></>}</div><details><summary>身份價格・{Object.keys(ratios).length?`已設定 ${Object.keys(ratios).length} 種`:"未設定時使用一般售價"}</summary><div className={styles.fields}>{Object.entries(priceCategories).filter(([key])=>key!=="GENERAL").map(([key,label])=><Field key={key} label={label+"售價比例 %"}><input aria-label={label+"售價比例"} type="number" min="0" max="100" step="0.01" placeholder="未設定，使用一般售價" readOnly={!data.canPriceManage} value={ratios[key as keyof typeof ratios]??""} onChange={e=>{const next={...ratios};if(e.target.value==="")delete next[key as keyof typeof ratios];else next[key as keyof typeof ratios]=Number(e.target.value);setRatios(next);}}/><span>{money(categoryPrice({price:productPrice,priceRatios:ratios},key as PriceCategory))}</span></Field>)}</div></details><details><summary>進階資料</summary><div className={styles.fields}><Field label="商品編號・選填"><input name="code" defaultValue={product?.code} maxLength={100}/></Field><Field label="條碼・選填"><input name="barcode" defaultValue={product?.barcode} maxLength={100}/></Field><Field label="內部備註・選填"><textarea name="note" defaultValue={product?.note} maxLength={2000}/></Field></div></details><div className={styles.footer}><label className={styles.checkbox}><input type="checkbox" name="active" defaultChecked={product?.active ?? true}/> 使用中</label><button type="submit" className={styles.primary} disabled={pending}>{pending?"儲存中…":"儲存商品"}</button></div></>}
    {panel.type === "supplier" && <><div className={styles.fields}>{[['name', '廠商名稱'], ['contact', '負責窗口'], ['phone', '電話'], ['address', '地址']].map(([name, label]) => <Field key={name} label={label}><input name={name} defaultValue={supplier?.[name as 'name' | 'contact' | 'phone' | 'address']} required={name !== 'address'}/></Field>)}</div><label><input type="checkbox" name="active" defaultChecked={supplier?.active ?? true}/> 使用中</label><button type="submit" className={styles.primary} disabled={pending}>儲存廠商</button></>}
    {panel.type === "count" && <><Field label="盤點原因"><input name="reason" required/></Field><input type="search" aria-label="篩選盤點商品" placeholder="即時篩選商品" value={query} onChange={e => setQuery(e.target.value)}/><div className={styles.table}><table><thead><tr><th>商品</th><th>帳面庫存</th><th>實際數量</th><th>差異</th></tr></thead><tbody>{data.products.filter(p => productSearch(p,query)).map(p => <tr key={p.id}><td>{p.name}</td><td className={styles.quantity}>{p.stock}</td><td><input aria-label={`${p.name} 實際數量`} type="number" min="0" step="1" placeholder="未盤點" value={counts[p.id] || ''} onChange={e => setCounts({ ...counts, [p.id]: e.target.value })}/></td><td>{counts[p.id] === undefined || counts[p.id] === '' ? '—' : Number(counts[p.id]) - p.stock}</td></tr>)}</tbody></table></div><button type="submit" className={styles.primary} disabled={pending}>儲存盤點</button></>}
  </form>;
}


function ReceivingEditor({data,panel,requestId,pending,onDirty,run}:{data:InventoryData;panel:{type:"receiving";id?:string;cost?:boolean};requestId:string;pending:boolean;onDirty:()=>void;run:(work:()=>Promise<{success:boolean;error?:string}>)=>Promise<void>}) {
 const old=data.receivings?.find(r=>r.id===panel.id);
 const [query,setQuery]=useState(""),[lines,setLines]=useState(old?.lines.map(l=>({...l,quantity:Math.max(0,l.expected-l.received)}))||[]);
 const update=(i:number,value:Partial<typeof lines[number]>)=>{setLines(prev=>prev.map((l,j)=>i===j?{...l,...value}:l));onDirty();};
 return <form className={styles.receivingForm} onChange={onDirty} onSubmit={e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  if(panel.cost&&old)void run(()=>confirmReceivingCost({requestId,id:old.id,revision:old.revision,supplierId:String(f.get("supplierId")||""),lines:lines.map(l=>({productId:l.productId,unitCost:l.unitCost}))}));
  else void run(()=>receiveGoods({requestId,id:old?.id,revision:old?.revision,date:String(f.get("date")),supplierId:String(f.get("supplierId")||""),deliveryNumber:String(f.get("deliveryNumber")||""),note:String(f.get("note")||""),lines:lines.map(l=>({productId:l.productId,expected:l.expected,quantity:l.quantity}))}));
 }}>
 <div className={styles.fields}><Field label="日期"><input name="date" type="date" defaultValue={old?.date||toLocalDateStr()} required disabled={panel.cost}/></Field><Field label={panel.cost?"廠商・必選":"廠商・選填"}><select name="supplierId" defaultValue={old?.supplierId||""} required={panel.cost}><option value="">待補廠商</option>{data.suppliers.filter(v=>v.active).map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></Field><Field label="廠商送貨單號・選填"><input name="deliveryNumber" defaultValue={old?.deliveryNumber} disabled={panel.cost}/></Field><Field label="備註／更正原因"><input name="note" defaultValue={old?.note} disabled={panel.cost}/></Field></div>
 {!old&&<><input aria-label="搜尋收貨商品" placeholder="搜尋商品" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<div className={styles.results}>{data.products.filter(p=>p.active&&productSearch(p,query)&&!lines.some(l=>l.productId===p.id)).map(p=><button key={p.id} type="button" onClick={()=>{setLines([...lines,{productId:p.id,name:p.name,expected:1,received:0,unitCost:null,quantity:1}]);onDirty();}}>{p.name} ＋</button>)}</div>}</>}
 <Table headers={["商品","訂購數量","已到貨",panel.cost?"單位成本":"本次實收／更正"]}>{lines.map((l,i)=><tr key={l.productId}><td>{l.name}</td><td>{old?l.expected:<input aria-label={l.name+" 訂購數量"} type="number" min="1" step="1" value={l.expected} onChange={e=>update(i,{expected:Number(e.target.value),quantity:Number(e.target.value)})} required/>}</td><td>{l.received}</td><td>{panel.cost?<input aria-label={l.name+" 確認成本"} placeholder="未確認；贈品填 0" type="number" min="0" step="1" value={l.unitCost??""} onChange={e=>update(i,{unitCost:e.target.value===""?null:Number(e.target.value)})} required/>:<input aria-label={l.name+" 本次實收"} type="number" min={-l.received} max={l.expected-l.received} step="1" value={l.quantity} onChange={e=>update(i,{quantity:Number(e.target.value)})} required/>}</td></tr>)}</Table>
 {old&&<details><summary>收貨紀錄</summary>{old.history.map(h=><p key={h.requestId}>{h.date}・{h.actorName}・{h.quantities.map(v=>lines.find(l=>l.productId===v.productId)?.name+" "+v.quantity).join("、")}</p>)}</details>}
 <div className={styles.footer}><span>{panel.cost?"補成本不會再次增加庫存":"只依本次實收數量入庫；負數更正須填原因"}</span><button className={styles.primary} type="submit" disabled={pending||!lines.length}>{pending?"儲存中…":panel.cost?"確認成本":"確認入庫"}</button></div>
 </form>;
}
