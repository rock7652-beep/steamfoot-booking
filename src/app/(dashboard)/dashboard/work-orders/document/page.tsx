import Image from "next/image";
import QRCode from "qrcode";
import { normalizeLineOfficialUrl } from "@/lib/line-official-url";
import { workOrderHours, workOrderLineId } from "@/lib/work-order-contact";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { inventoryContext } from "@/server/services/inventory";
import { workOrderDetails, workOrderNumber, workOrderContent, LABOR_PRODUCT_ID, workOrderStatuses } from "@/lib/work-orders";
import type { InventoryLine } from "@/lib/inventory";
import { PrintButton } from "../../inventory/document/print-button";
import styles from "./print.module.css";

const money=(n:number)=>`$${n.toLocaleString("zh-TW")}`;
export default async function WorkOrderDocument({searchParams}:{searchParams:Promise<{id?:string}>}){
  const ctx=await inventoryContext("work_order.read"),{id}=await searchParams;if(!id)notFound();
  const [order,store]=await Promise.all([prisma.inventoryOrder.findFirst({where:{storeId:ctx.storeId,id,kind:"SALE"}}),prisma.store.findUniqueOrThrow({where:{id:ctx.storeId},select:{name:true,businessHours:true,shopConfig:{select:{address:true,shopPhone:true,lineOfficialId:true,lineOfficialUrl:true}}}})]);
  const details=workOrderDetails(order?.workOrder);if(!order||!details)notFound();
  const contactUrl=normalizeLineOfficialUrl(store.shopConfig?.lineOfficialUrl);
  const contactId=workOrderLineId(store.shopConfig?.lineOfficialId, contactUrl);
  const qr=contactUrl?await QRCode.toDataURL(contactUrl,{errorCorrectionLevel:"M",margin:4,width:240}):null;
  const hours=workOrderHours(store.businessHours);
  const lines=order.lines as unknown as InventoryLine[];
  const workItems=workOrderContent(details).split(/\r?\n/).filter(line=>line.trim());
  return <main className={styles.page}><div className={styles.controls}><PrintButton/></div><div id="work-order-document" className={styles.copies}>{["顧客聯","店家聯"].map(copy=><article key={copy} className={styles.copy}>
    <header className={styles.heading}><h1>{store.name}</h1><h2>工單・{copy}</h2></header>
    <div className={styles.meta}><p className={styles.number}>單號：{workOrderNumber(order)}</p><p>日期：{order.date.toISOString().slice(0,10)}</p></div><p>顧客：{order.partyName}　電話：{order.partyPhone}</p>
    <div className={styles.meta}><p>種類／型號：{details.serial||"—"}</p><p>進度：{workOrderStatuses[details.status]}</p></div>
    <section className={styles.workItems} aria-label="施工項目"><h3>施工項目</h3><ol>{workItems.map((item,index)=><li key={index}>{item}</li>)}</ol></section>
    <h3 className={styles.materialTitle}>商品／材料與工費</h3>
    <table><thead><tr><th>品項</th><th>數量</th><th>單價／優惠</th><th>金額</th></tr></thead><tbody>{lines.map(l=><tr key={l.productId}><td>{l.productId===LABOR_PRODUCT_ID?"工費":l.name}</td><td>{l.quantity}</td><td>{money(l.unitPrice)}{l.gift?"・贈品":l.discountMode==="PERCENT"?`・折扣 ${l.discount}%`:l.discountMode==="AMOUNT"?`・折抵 ${money(l.discount)}`:""}</td><td>{money(l.total)}</td></tr>)}</tbody></table>
    {details.note&&<div className={styles.note}><b>顧客備註</b><p>{details.note}</p></div>}<p className={styles.totals}>應收 {money(order.total)}・已收 {money(order.paid)}・尚欠 {money(order.total-order.paid)}</p><footer><div className={styles.signature}><b>交件確認</b><span aria-label="交件簽名欄" /></div><div className={styles.contact}><div><b>取件與諮詢</b>{hours.length>0&&<p>營業時間：{hours.join("；")}</p>}{store.shopConfig?.shopPhone?.trim()&&<p>電話：{store.shopConfig.shopPhone}</p>}{store.shopConfig?.address?.trim()&&<p>地址：{store.shopConfig.address}</p>}{contactId&&<p>官方 LINE ID：{contactId}</p>}<p>取件前請先聯繫店家，確認已可取件及當日營業時間。</p></div>{qr&&<Image unoptimized src={qr} alt="店家官方 LINE QR Code" width={100} height={100}/>}</div></footer>
  </article>)}</div></main>;
}
