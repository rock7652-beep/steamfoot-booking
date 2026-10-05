import { notFound } from "next/navigation";
import { inventoryContext, inventoryDocumentData } from "@/server/services/inventory";
import { inventoryPrintBody, inventoryPrintCss } from "@/lib/inventory-print";
import { PrintButton } from "./print-button";
import styles from "./print.module.css";
import "./print-global.css";
export default async function InventoryDocument({searchParams}:{searchParams:Promise<{autoPrint?:string;kind?:string;id?:string}>}) {
 const ctx=await inventoryContext();
 const {kind,id,autoPrint}=await searchParams;
 if(!id||!['sale','receipt'].includes(kind||''))notFound();
 const data=await inventoryDocumentData(ctx,kind!,id);
 const body=inventoryPrintBody(data,kind!,id);if(body===null)notFound();
 return <div className={styles.page}><style>{inventoryPrintCss}</style><div className={styles.controls}><PrintButton autoPrint={autoPrint==="1"}/></div><article id="inventory-document" className="document" dangerouslySetInnerHTML={{__html:body}}/></div>;
}
