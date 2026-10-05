import { notFound } from "next/navigation";
import { inventoryContext, inventoryData } from "@/server/services/inventory";
import { PrintButton } from "./print-button";
import styles from "./print.module.css";
import "./print-global.css";
const money = (n: number) => "$" + n.toLocaleString("zh-TW");
export default async function InventoryDocument({ searchParams }: {
    searchParams: Promise<{
        kind?: string;
        id?: string;
    }>;
}) {
    const { kind, id } = await searchParams;
    if (!id || !['sale', 'receipt'].includes(kind || ''))
        notFound();
    const data = await inventoryData(await inventoryContext());
    const sale = kind === 'sale' ? data.orders.find(o => o.kind === 'SALE' && o.id === id) : undefined;
    const receipt = kind === 'receipt' ? data.payments.find(p => p.kind === 'SALE' && p.id === id) : undefined;
    if (!sale && !receipt)
        notFound();
    const item = sale || receipt!;
    return <div className={styles.page}><div className={styles.controls}><PrintButton /></div><article id="inventory-document" className={styles.document}>
    <h1>{data.store.name}</h1><p>{[data.store.phone, data.store.address].filter(Boolean).join('・')}</p>
    <h2>{sale ? '銷貨明細' : '收款明細'}</h2><p>單號 {id}　日期 {item.date}</p><p>顧客 {item.partyName}　電話 {item.partyPhone}</p>
    {sale ? <><table><thead><tr><th>商品</th><th>數量</th><th>原單價</th><th>優惠</th><th>實際金額</th></tr></thead><tbody>{sale.lines.map(l => <tr key={l.productId}><td>{l.name}{l.gift ? '（贈品）' : ''}</td><td>{l.quantity}</td><td>{money(l.unitPrice)}</td><td>{l.gift ? '贈送' : l.discountMode === 'PERCENT' ? `折扣 ${l.discount}%` : l.discountMode === 'AMOUNT' ? `折抵 ${money(l.discount)}` : '—'}</td><td>{money(l.total)}</td></tr>)}</tbody></table><div className={styles.totals}><p>商品金額 <b>{money(sale.total - sale.freight)}</b></p>{sale.freight > 0 && <p>運費 <b>{money(sale.freight)}</b></p>}<p>應收總額 <b>{money(sale.total)}</b></p><p>已收金額 <b>{money(sale.paid)}</b></p><p>尚欠金額 <b>{money(sale.total - sale.paid)}</b></p></div><p>交貨方式：{sale.delivery}{sale.channel ? `・${sale.channel}` : ''}</p>{sale.shippingNote && <p className={styles.note}>寄送備註：{sale.shippingNote}</p>}</> : <><p>付款方式：{receipt!.method}</p><table><thead><tr><th>銷貨單號</th><th>本次收款</th><th>收款後尚欠</th></tr></thead><tbody>{receipt!.allocations.map(a => <tr key={a.orderId}><td>{a.orderId}</td><td>{money(a.amount)}</td><td>{money(a.remainingAfter)}</td></tr>)}</tbody></table><div className={styles.totals}><p>本次實收 <b>{money(receipt!.total)}</b></p><p>本單所列銷貨尚欠 <b>{money(receipt!.allocations.reduce((n, a) => n + a.remainingAfter, 0))}</b></p></div></>}
    <footer>{new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} 列印</footer>
  </article></div>;
}
