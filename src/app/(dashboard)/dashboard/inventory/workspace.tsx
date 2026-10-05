"use client";
import { useRef, useState, type ReactNode } from "react";
import { ModalPanel } from "@/components/admin/modal-panel";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { OperationHistoryButton } from "@/components/operation-history-button";
import { toLocalDateStr } from "@/lib/date-utils";
import { inventoryReport, lineTotal, type InventoryData, type InventoryOrderView, type LineInput } from "@/lib/inventory";
import { loadInventory, saveOrder, savePayment, saveProduct, saveSupplier, saveStockCount } from "@/server/actions/inventory";
import { createCustomer } from "@/server/actions/customer";
import styles from "./workspace.module.css";
const money = (n: number) => "$" + n.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
const short = (id: string) => id.slice(-8).toUpperCase();
const tabs = [['sales', '銷貨單'], ['receipts', '收款單'], ['purchases', '進貨單'], ['products', '商品與庫存'], ['report', '銷貨報表'], ['suppliers', '廠商管理']] as const;
type Tab = typeof tabs[number][0];
type Panel = {
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
const Table = ({ headers, children }: {
    headers: string[];
    children: ReactNode;
}) => <div className={styles.table}><table><thead><tr>{headers.map(h => <th key={h} className={h === "操作" ? styles.actions : /數量|庫存/.test(h) ? styles.quantity : /金額|成本|毛利|售價/.test(h) ? styles.number : undefined}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
const More = ({ label, children }: {
    label: string;
    children: ReactNode;
}) => <ExclusiveMenu label={label} triggerText="⋯" quiet><div className={styles.menu}>{children}</div></ExclusiveMenu>;
const Field = ({ label, children }: {
    label: string;
    children: ReactNode;
}) => <label className={styles.field}><span>{label}</span>{children}</label>;
export function InventoryWorkspace({ initial }: {
    initial: InventoryData;
}) {
    const [data, setData] = useState(initial), [tab, setTab] = useState<Tab>("sales"), [queries, setQueries] = useState<Record<string, string>>({}), [filters, setFilters] = useState<Record<string, string>>({}), [panel, setPanel] = useState<Panel>(null), [pending, setPending] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [selected, setSelected] = useState<string[]>([]), [parties, setParties] = useState<Record<string, string>>({}), [daily, setDaily] = useState(false), [from, setFrom] = useState(toLocalDateStr().slice(0, 7) + "-01"), [to, setTo] = useState(toLocalDateStr());
    const [receiptKind, setReceiptKind] = useState<"SALE" | "PURCHASE">("SALE");
    const dirty = useRef(false), busy = useRef(false), requestId = useRef("");
    const query = queries[tab] || "";
    const filter = filters[tab] || "all", party = parties[tab] || "";
    const setFilter = (v: string) => setFilters(prev => ({ ...prev, [tab]: v }));
    const setParty = (v: string) => setParties(prev => ({ ...prev, [tab]: v }));
    const search = (value: string) => setQueries({ ...queries, [tab]: value });
    const open = (p: Panel) => { setError(""); dirty.current = false; requestId.current = crypto.randomUUID(); setPanel(p); };
    const close = () => { if (pending)
        return; if (dirty.current && !confirm("放棄尚未儲存的內容？"))
        return; setPanel(null); setError(""); dirty.current = false; };
    const run = async (work: () => Promise<{
        success: boolean;
        error?: string;
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
        if (latest.success && latest.data)
            setData(latest.data as InventoryData);
        else
            setError("已儲存，但清單更新失敗；請重新整理");
        setPanel(null);
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
    const shown = orders.filter(o => (!party || o.partyId === party) && (filter === "all" || (filter === "unpaid" ? o.total > o.paid : o.total === o.paid)) && [o.id, o.partyName, o.partyPhone, ...o.lines.map(l => l.name)].join(" ").toLowerCase().includes(query.toLowerCase()));
    const unpaid = orders.filter(o => o.total > o.paid);
    const visibleTabs = tabs.filter(([v]) => data.canCost || !['purchases', 'report'].includes(v));
    const receiptOrders = data.orders.filter(o => o.partyId === party && o.kind === receiptKind);
    const receiptUnpaid = receiptOrders.filter(o => o.total > o.paid);
    const receiptCanPay = receiptKind === "PURCHASE" ? data.canManage && data.canCost : data.canWrite;
    const doc = (kind: string, id: string) => window.open(`/dashboard/inventory/document?kind=${kind}&id=${encodeURIComponent(id)}`, "_blank", "noopener,noreferrer");
    return <div className={styles.workspace}>
    <div className={styles.heading}><h1>進銷存</h1>{((tab === "sales" && data.canWrite) || (['purchases', 'products', 'suppliers'].includes(tab) && data.canManage)) && <button type="button" className={styles.primary} disabled={tab === "products" && !data.canCost} onClick={() => open(tab === "products" ? { type: "product" } : tab === "suppliers" ? { type: "supplier" } : { type: "order", kind: orderKind })}>＋ {tab === "products" ? "新增商品" : tab === "suppliers" ? "新增廠商" : tab === "purchases" ? "新增進貨" : "新增銷貨"}</button>}</div>
    <nav className={styles.tabs} aria-label="進銷存分類">{visibleTabs.map(([v, label]) => <button key={v} type="button" className={tab === v ? styles.active : ""} aria-pressed={tab === v} onClick={() => { setTab(v); setSelected([]); }}>{label}</button>)}</nav>
    {notice && <p className={styles.notice} role="status">{notice}</p>}{error && !panel && <p className={styles.error} role="alert">{error}</p>}
    {(tab === "sales" || tab === "purchases") && <>
      <div className={styles.unpaid}>未{tab === "sales" ? "收" : "付"}清 {unpaid.length} 筆・尚欠 {money(unpaid.reduce((n, o) => n + o.total - o.paid, 0))}</div>
      <div className={styles.toolbar}>{["all", "unpaid", "paid"].map((v, i) => <button key={v} type="button" className={filter === v ? styles.active : ""} onClick={() => setFilter(v)}>{["全部", "未付清", "已付清"][i]}</button>)}<input className={styles.search} type="search" aria-label="即時搜尋单據" placeholder="即時搜尋品項、姓名、電話或單號" value={query} onChange={e => search(e.target.value)}/><select aria-label="批次收付款對象" value={party} onChange={e => { setParty(e.target.value); setSelected([]); }}><option value="">全部{tab === "sales" ? "顧客" : "廠商"}</option>{[...new Map(orders.map(o => [o.partyId, o])).values()].map(o => <option key={o.partyId} value={o.partyId}>{o.partyName}・{o.partyPhone}</option>)}</select>{party && <button type="button" disabled={!selected.length || !(tab === "sales" ? data.canWrite : data.canManage)} onClick={() => open({ type: "payment", orders: orders.filter(o => selected.includes(o.id)) })}>批次{tab === "sales" ? "收款" : "付款"}（{selected.length}）</button>}</div>
      <Table headers={["選取", "日期／單號", tab === "sales" ? "顧客" : "廠商", "品項", "應付／應收金額", "已付／已收金額", "尚欠金額", "操作"]}>{shown.map(o => <tr key={o.id}><td><input type="checkbox" aria-label={`選取 ${short(o.id)}`} disabled={!party || o.paid === o.total} checked={selected.includes(o.id)} onChange={e => setSelected(e.target.checked ? [...selected, o.id] : selected.filter(id => id !== o.id))}/></td><td>{o.date}<span className={styles.sub}>{short(o.id)}</span></td><td>{o.partyName}<span className={styles.sub}>{o.partyPhone}</span></td><td>{o.lines.map(l => <div key={l.productId}>{l.name} × {l.quantity}{l.gift ? '・贈品' : ''}</div>)}</td><td className={styles.number}>{money(o.total)}</td><td className={styles.number}>{money(o.paid)}</td><td className={styles.number}>{o.total > o.paid ? <span className={styles.unpaid}>{money(o.total - o.paid)}</span> : "已付清"}</td><td className={styles.actions}><div className={styles.actionGroup}>{o.total > o.paid && (tab === "sales" ? data.canWrite : data.canManage) && <button type="button" className={styles.primary} onClick={() => open({ type: "payment", orders: [o] })}>{tab === "sales" ? "收款" : "付款"}</button>}<More label={`${short(o.id)} 更多操作`}>{tab === "sales" && data.canWrite && <button type="button" onClick={() => open({ type: "order", kind: "SALE", order: o })}>編輯銷貨單</button>}{tab === "sales" && <button type="button" onClick={() => doc("sale", o.id)}>列印銷貨明細</button>}<button type="button" onClick={() => { setParties(prev => ({ ...prev, receipts: o.partyId })); setReceiptKind(o.kind === "PURCHASE" ? "PURCHASE" : "SALE"); setTab("receipts"); }}>收付款紀錄</button><OperationHistoryButton targetType="InventoryOrder" targetId={o.id}/></More></div></td></tr>)}</Table>{!shown.length && <div className={styles.empty}>沒有符合條件的資料</div>}
    </>}
    {tab === "receipts" && <>
      <div className={styles.toolbar}>
        {data.canCost && <select aria-label="收付款紀錄對象類型" value={receiptKind} onChange={e => { setReceiptKind(e.target.value as "SALE" | "PURCHASE"); setParty(""); }}><option value="SALE">顧客收款</option><option value="PURCHASE">廠商付款</option></select>}
        <input type="search" className={styles.search} placeholder={receiptKind === "SALE" ? "輸入顧客姓名或電話，即時搜尋" : "輸入廠商名稱或電話，即時搜尋"} aria-label={receiptKind === "SALE" ? "顧客姓名或電話" : "廠商名稱或電話"} value={query} onChange={e => { search(e.target.value); setParty(""); }}/>
      </div>
      {!party ? <div className={styles.results}>{(receiptKind === "SALE" ? data.customers : data.suppliers).filter(c => [c.name, c.phone].join(" ").includes(query)).map(c => <button type="button" key={c.id} onClick={() => setParty(c.id!)}>{c.name}・{c.phone}・尚欠 {money(data.orders.filter(o => o.kind === receiptKind && o.partyId === c.id).reduce((n, o) => n + o.total - o.paid, 0))}</button>)}</div> : <>
        <button type="button" onClick={() => setParty("")}>{receiptKind === "SALE" ? "更換顧客" : "更換廠商"}</button>
        <h2>{(receiptKind === "SALE" ? data.customers : data.suppliers).find(c => c.id === party)?.name}</h2>
        <div className={styles.toolbar}><button type="button" disabled={!receiptCanPay || !receiptUnpaid.length} onClick={() => open({ type: "payment", orders: receiptUnpaid })}>{receiptKind === "SALE" ? "收取未付款" : "支付未付款"}</button></div>
        <Table headers={[receiptKind === "SALE" ? "日期／銷貨單" : "日期／進貨單", "購物明細", receiptKind === "SALE" ? "應收金額" : "應付金額", receiptKind === "SALE" ? "已收金額" : "已付金額", "尚欠金額"]}>{receiptOrders.map(o => <tr key={o.id}><td>{o.date}・{short(o.id)}</td><td>{o.lines.map(l => `${l.name} × ${l.quantity}${l.gift ? '（贈品）' : ''}`).join('、')}</td><td className={styles.number}>{money(o.total)}</td><td className={styles.number}>{money(o.paid)}</td><td className={styles.number}>{money(o.total - o.paid)}</td></tr>)}</Table>
        <h2>收付款紀錄</h2><Table headers={["日期／單號", "付款方式", "金額", "操作"]}>{data.payments.filter(p => p.partyId === party && p.kind === receiptKind).map(p => <tr key={p.id}><td>{p.date}・{short(p.id)}</td><td>{p.method}</td><td className={styles.number}>{money(p.total)}</td><td className={styles.actions}>{p.kind === "SALE" && <button type="button" onClick={() => doc("receipt", p.id)}>列印收款明細</button>}</td></tr>)}</Table>
      </>}
    </>}
    {tab === "products" && <><div className={styles.toolbar}><input type="search" className={styles.search} placeholder="即時搜尋商品" aria-label="搜尋商品" value={query} onChange={e => search(e.target.value)}/>{data.canManage && <button type="button" onClick={() => open({ type: "count" })}>庫存盤點</button>}{data.canExport && <a href="/api/inventory/export">輸出 Excel</a>}</div><Table headers={["商品", "庫存數量", ...(data.canCost ? ["平均成本"] : []), "預設售價", "操作"]}>{data.products.filter(p => p.name.includes(query)).map(p => <tr key={p.id}><td>{p.name}{!p.active && <span className={styles.sub}>已停用</span>}</td><td className={styles.quantity}>{p.stock}</td>{data.canCost && <td className={styles.number}>{money(p.averageCost || 0)}</td>}<td className={styles.number}>{money(p.price)}</td><td className={styles.actions}><More label={p.name + " 更多操作"}>{data.canManage && data.canCost && <button type="button" onClick={() => open({ type: "product", id: p.id })}>編輯商品</button>}<OperationHistoryButton targetType="InventoryProduct" targetId={p.id}/></More></td></tr>)}</Table><h2>盤點紀錄</h2>{data.counts.map(c => <details key={c.id}><summary>{c.date}・{c.actorName}・{c.reason}・{c.lines.length} 個品項</summary><p>儲存時間：{new Date(c.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</p><Table headers={["商品", "帳面庫存", "實際數量", "差異數量"]}>{c.lines.map(l => <tr key={l.productId}><td>{l.name}</td><td className={styles.quantity}>{l.before}</td><td className={styles.quantity}>{l.actual}</td><td className={styles.quantity}>{l.difference}</td></tr>)}</Table></details>)}</>}
    {tab === "suppliers" && <><div className={styles.toolbar}><input className={styles.search} type="search" placeholder="即時搜尋廠商、窗口或電話" aria-label="搜尋廠商" value={query} onChange={e => search(e.target.value)}/></div><Table headers={["廠商", "負責窗口", "電話", "地址", ...(data.canCost ? ["尚欠金額"] : []), "操作"]}>{data.suppliers.filter(s => [s.name, s.contact, s.phone].join(' ').includes(query)).map(s => <tr key={s.id}><td>{s.name}{!s.active && <span className={styles.sub}>已停用</span>}</td><td>{s.contact}</td><td>{s.phone}</td><td>{s.address}</td>{data.canCost && <td className={styles.number}>{money(data.orders.filter(o => o.kind === "PURCHASE" && o.partyId === s.id).reduce((n, o) => n + o.total - o.paid, 0))}</td>}<td className={styles.actions}><More label={s.name + " 更多操作"}>{data.canManage && <button type="button" onClick={() => open({ type: "supplier", id: s.id })}>編輯廠商</button>}<OperationHistoryButton targetType="InventorySupplier" targetId={s.id!}/></More></td></tr>)}</Table></>}
    {tab === "report" && data.canCost && (() => { const rows = inventoryReport(data.orders, from, to, daily).filter(r => r.name.includes(query)), total = rows.reduce((n, r) => n + r.total, 0), cost = rows.reduce((n, r) => n + r.cost, 0); return <><div className={styles.toolbar}><input type="date" aria-label="開始日期" value={from} onChange={e => setFrom(e.target.value)}/><input type="date" aria-label="結束日期" value={to} onChange={e => setTo(e.target.value)}/><button type="button" className={!daily ? styles.active : ""} onClick={() => setDaily(false)}>品項彙總</button><button type="button" className={daily ? styles.active : ""} onClick={() => setDaily(true)}>每日明細</button><input className={styles.search} type="search" aria-label="篩選報表商品" placeholder="即時篩選商品" value={query} onChange={e => search(e.target.value)}/></div><div className={styles.stats}>{[["實際售出金額", money(total)], ["銷貨成本", money(cost)], ["毛利", money(total - cost)], ["毛利率", total ? ((total - cost) / total * 100).toFixed(1) + '%' : '—']].map(([label, v]) => <div key={label}>{label}<strong>{v}</strong></div>)}</div><Table headers={[...(daily ? ["日期"] : []), "商品", "售出數量", "贈送數量", "實際售出金額", "成本", "毛利", "毛利率"]}>{rows.map((r, i) => <tr key={i}>{daily && <td>{r.date}</td>}<td>{r.name}</td><td className={styles.quantity}>{r.sold}</td><td className={styles.quantity}>{r.gifts}</td><td className={styles.number}>{money(r.total)}</td><td className={styles.number}>{money(r.cost)}</td><td className={styles.number}>{money(r.profit)}</td><td className={styles.number}>{r.margin === null ? '—' : r.margin.toFixed(1) + '%'}</td></tr>)}</Table></>; })()}
    <ModalPanel open={!!panel} onClose={close} labelledById="inventory-editor-title" pending={pending} width={1100}><div className={`${styles.workspace} ${styles.editor}`}><div className={styles.heading}><h2 id="inventory-editor-title">{panel?.type === "order" ? (panel.order ? '編輯销貨單' : panel.kind === "SALE" ? '新增銷貨' : '新增進貨') : panel?.type === "payment" ? '收付款' : panel?.type === "product" ? '商品資料' : panel?.type === "supplier" ? '廠商資料' : '庫存盤點'}</h2><button type="button" disabled={pending} onClick={close}>關閉</button></div>{panel && <Editor key={requestId.current} panel={panel} data={data} pending={pending} requestId={requestId.current} onDirty={() => { dirty.current = true; }} run={run} onData={setData}/>}<p className={styles.error} role="alert">{error}</p></div></ModalPanel>
  </div>;
}
function Editor({ panel, data, pending, requestId, onDirty, run, onData }: {
    panel: NonNullable<Panel>;
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
    const [lines, setLines] = useState<LineInput[]>(order?.lines.map(l => ({ ...l })) || []), [query, setQuery] = useState(""), [partyId, setPartyId] = useState(order?.partyId || ""), [partyQuery, setPartyQuery] = useState(""), [delivery, setDelivery] = useState(order?.delivery || "自取"), [freight, setFreight] = useState(order?.freight || 0), [method, setMethod] = useState("現金"), [manualPaid, setManualPaid] = useState<number | null>(null), [newCustomer, setNewCustomer] = useState(false), [customerError, setCustomerError] = useState(""), [creating, setCreating] = useState(false);
    const kind = panel.type === "order" ? panel.kind : "SALE";
    const supplier = panel.type === "supplier" ? data.suppliers.find(s => s.id === panel.id) : undefined;
    const product = panel.type === "product" ? data.products.find(p => p.id === panel.id) : undefined;
    const [amounts, setAmounts] = useState<Record<string, number>>(panel.type === "payment" ? Object.fromEntries(panel.orders.map(o => [o.id, o.total - o.paid])) : {});
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
                void run(() => saveOrder({ requestId, id: order?.id, revision: order?.revision, kind, date: text('date'), partyId, lines, paid: order ? order.paid : method === "未付款" ? 0 : num('paid'), method, delivery, channel: text('channel'), freight: delivery === "寄送" ? freight : 0, shippingNote: text('shippingNote'), internalNote: text('internalNote') }));
            if (panel.type === "payment")
                void run(() => savePayment({ requestId, kind: panel.orders[0].kind, date: text('date'), method: text('method'), allocations: panel.orders.filter(o => amounts[o.id] > 0).map(o => ({ orderId: o.id, amount: amounts[o.id] })) }));
            if (panel.type === "product")
                void run(() => saveProduct({ id: product?.id, revision: product?.revision, name: text('name'), price: num('price'), stock: num('stock'), averageCost: num('cost'), active: f.get('active') === 'on' }));
            if (panel.type === "supplier")
                void run(() => saveSupplier({ id: supplier?.id, name: text('name'), contact: text('contact'), phone: text('phone'), address: text('address'), active: f.get('active') === 'on' }));
            if (panel.type === "count")
                void run(() => saveStockCount({ requestId, date: text('date'), reason: text('reason'), lines: data.products.filter(p => counts[p.id] !== undefined && counts[p.id] !== '').map(p => ({ productId: p.id, revision: p.revision, actual: Number(counts[p.id]) })) }));
        }}>
    {(panel.type === "order" || panel.type === "payment" || panel.type === "count") && <div className={styles.meta}><Field label="日期"><input type="date" name="date" defaultValue={order?.date || toLocalDateStr()} required/></Field>{panel.type === "order" && <Field label={kind === "SALE" ? '顧客・必選' : '廠商・必選'}>{partyId ? <div className={styles.toolbar}><span>{(kind === "SALE" ? data.customers : data.suppliers).find(c => c.id === partyId)?.name}・{(kind === "SALE" ? data.customers : data.suppliers).find(c => c.id === partyId)?.phone}</span>{!order && <button type="button" onClick={() => setPartyId("")}>更換</button>}</div> : <><input type="search" aria-label="即時搜尋姓名或電話" placeholder="搜尋姓名或電話" value={partyQuery} onChange={e => setPartyQuery(e.target.value)}/>{partyQuery && <div className={styles.results}>{(kind === "SALE" ? data.customers : data.suppliers.filter(s => s.active)).filter(c => [c.name, c.phone].join(' ').includes(partyQuery)).map(c => <button type="button" key={c.id} onClick={() => { setPartyId(c.id); onDirty(); }}>{c.name}・{c.phone}</button>)}</div>}</>}</Field>}</div>}
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
      <input type="search" placeholder="搜尋商品，點選即可加入" aria-label="即時篩選商品" value={query} onChange={e => setQuery(e.target.value)}/>{query && <div className={styles.results}>{data.products.filter(p => p.active && p.name.includes(query)).map(p => <button type="button" key={p.id} onClick={() => { const i = lines.findIndex(l => l.productId === p.id); if (i >= 0)
            update(i, { quantity: lines[i].quantity + 1 });
        else
            setLines([...lines, { productId: p.id, quantity: 1, unitPrice: kind === "SALE" ? p.price : Math.round(p.averageCost || 0), discountMode: "NONE", discount: 0, gift: false }]); onDirty(); }}>{p.name}・庫存 {p.stock}・{money(p.price)}　＋ 加入</button>)}</div>}
      <div className={`${styles.table} ${styles.lines}`}><table><thead><tr>{['商品', '庫存', '數量', kind === "SALE" ? '單價' : '進貨成本', ...(kind === "SALE" ? ['折扣方式', '折扣', '贈品'] : []), '實際小計', '操作'].map(h => <th key={h} className={/庫存|數量/.test(h)?styles.quantity:/單價|成本|小計/.test(h)?styles.number:h==="操作"?styles.actions:undefined}>{h}</th>)}</tr></thead><tbody>{lines.map((l, i) => { const p = data.products.find(p => p.id === l.productId); let amount = 0; try {
            amount = lineTotal(l, kind);
        }
        catch { } return <tr key={l.productId}><td>{p?.name}</td><td className={styles.quantity}>{p?.stock}</td><td><input aria-label={`${p?.name} 數量`} type="number" min="1" step="1" value={l.quantity} onChange={e => update(i, { quantity: Number(e.target.value) })} required/></td><td><input aria-label={`${p?.name} ${kind === "SALE" ? '單價' : '進貨成本'}`} type="number" min="0" step="1" value={l.unitPrice} onChange={e => update(i, { unitPrice: Number(e.target.value) })} required/></td>{kind === "SALE" && <><td><select aria-label={`${p?.name} 折扣方式`} disabled={l.gift} value={l.discountMode} onChange={e => update(i, { discountMode: e.target.value as LineInput['discountMode'], discount: 0 })}><option value="NONE">無折扣</option><option value="AMOUNT">折抵金額</option><option value="PERCENT">折扣 %</option></select></td><td><input aria-label={`${p?.name} 折扣`} type="number" min="0" max={l.discountMode === "PERCENT" ? 100 : undefined} disabled={l.gift || l.discountMode === "NONE"} value={l.discount} onChange={e => update(i, { discount: Number(e.target.value) })}/></td><td className={styles.quantity}><input type="checkbox" aria-label={`${p?.name} 贈品`} checked={l.gift} onChange={e => update(i, { gift: e.target.checked })}/></td></>}<td className={styles.number}>{money(amount)}</td><td><button type="button" onClick={() => { setLines(lines.filter((_, j) => i !== j)); onDirty(); }}>移除</button></td></tr>; })}</tbody></table></div>
      {kind === "SALE" && <div className={styles.delivery}><Field label="交貨方式"><select value={delivery} onChange={e => setDelivery(e.target.value)}><option>自取</option><option>寄送</option></select></Field>{delivery === "寄送" && <><Field label="寄送管道"><select name="channel" defaultValue={order?.channel || ''} required><option value="">請選擇</option>{['超商', '蝦皮', '貨運', '其他'].map(s => <option key={s}>{s}</option>)}</select></Field><Field label="運費（顧客）"><input type="number" min="0" step="1" value={freight} onChange={e => setFreight(Number(e.target.value))}/></Field><Field label="寄送備註（列印）"><input name="shippingNote" placeholder="收件人、電話、地址／超商門市" defaultValue={order?.shippingNote}/></Field></>}</div>}
      <div className={styles.payment}><Field label={order ? '累計已收款' : '本次收付款金額'}><input type="number" name="paid" min="0" step="1" max={total} value={order ? order.paid : method === "未付款" ? 0 : manualPaid ?? total} onChange={e => setManualPaid(Number(e.target.value))} disabled={!!order || method === "未付款"} required/></Field><Field label="收付款"><select value={method} onChange={e => setMethod(e.target.value)} disabled={!!order}>{['現金', '轉帳', '其他', '未付款'].map(v => <option key={v}>{v}</option>)}</select></Field><Field label="內部備註（不列印）"><input name="internalNote" defaultValue={order?.internalNote}/></Field></div><div className={styles.footer}><strong>應收／應付金額 {money(total)}</strong><button type="submit" className={styles.primary} disabled={pending || !partyId || !lines.length}>{pending ? '儲存中…' : order ? '儲存修改' : kind === "SALE" ? '完成銷貨' : '完成進貨'}</button></div>
    </>}
    {panel.type === "payment" && <><Field label="付款方式"><select name="method"><option>現金</option><option>轉帳</option><option>其他</option></select></Field><div className={styles.table}><table><thead><tr><th>單號</th><th>尚欠金額</th><th>本次收付款</th></tr></thead><tbody>{panel.orders.map(o => <tr key={o.id}><td>{short(o.id)}</td><td>{money(o.total - o.paid)}</td><td><input aria-label={`${short(o.id)} 收付款金額`} type="number" min="0" step="1" max={o.total - o.paid} value={amounts[o.id]} onChange={e => setAmounts({ ...amounts, [o.id]: Number(e.target.value) })} required/></td></tr>)}</tbody></table></div><div className={styles.footer}><strong>本次金額 {money(Object.values(amounts).reduce((a, b) => a + b, 0))}</strong><button type="submit" className={styles.primary} disabled={pending}>完成收付款</button></div></>}
    {panel.type === "product" && <><div className={styles.fields}><Field label="商品名稱"><input name="name" defaultValue={product?.name} required/></Field><Field label="預設售價"><input name="price" type="number" min="0" step="1" defaultValue={product?.price || 0} required/></Field>{!product && <><Field label="初始庫存"><input name="stock" type="number" min="0" step="1" defaultValue={0} required/></Field><Field label="平均成本"><input name="cost" type="number" min="0" step="0.01" defaultValue={0} required/></Field></>}</div><label><input type="checkbox" name="active" defaultChecked={product?.active ?? true}/> 使用中</label><button type="submit" className={styles.primary} disabled={pending}>儲存商品</button></>}
    {panel.type === "supplier" && <><div className={styles.fields}>{[['name', '廠商名稱'], ['contact', '負責窗口'], ['phone', '電話'], ['address', '地址']].map(([name, label]) => <Field key={name} label={label}><input name={name} defaultValue={supplier?.[name as 'name' | 'contact' | 'phone' | 'address']} required={name !== 'address'}/></Field>)}</div><label><input type="checkbox" name="active" defaultChecked={supplier?.active ?? true}/> 使用中</label><button type="submit" className={styles.primary} disabled={pending}>儲存廠商</button></>}
    {panel.type === "count" && <><Field label="盤點原因"><input name="reason" required/></Field><input type="search" aria-label="篩選盤點商品" placeholder="即時篩選商品" value={query} onChange={e => setQuery(e.target.value)}/><div className={styles.table}><table><thead><tr><th>商品</th><th>帳面庫存</th><th>實際數量</th><th>差異</th></tr></thead><tbody>{data.products.filter(p => p.name.includes(query)).map(p => <tr key={p.id}><td>{p.name}</td><td className={styles.quantity}>{p.stock}</td><td><input aria-label={`${p.name} 實際數量`} type="number" min="0" step="1" placeholder="未盤點" value={counts[p.id] || ''} onChange={e => setCounts({ ...counts, [p.id]: e.target.value })}/></td><td>{counts[p.id] === undefined || counts[p.id] === '' ? '—' : Number(counts[p.id]) - p.stock}</td></tr>)}</tbody></table></div><button type="submit" className={styles.primary} disabled={pending}>儲存盤點</button></>}
  </form>;
}
