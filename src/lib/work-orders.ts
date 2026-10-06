import { z } from "zod";
import { dateSchema, lineSchema, priceCategorySchema, type InventoryOrderView, type InventoryLine } from "./inventory";

export const workOrderStatuses = { PROCESSING: "處理中", READY: "待取件", CANCELLED: "已取消・待取件", COLLECTED: "已取件" } as const;
export const LABOR_PRODUCT_ID = "__work_order_labor__";
// The database's Int representation is the only storage limit, not a shop fee cap.
export const workOrderMoney = z.number().int().nonnegative().max(2147483647, "金額超出系統可儲存範圍");
export const workOrderDetailsSchema = z.object({
  status: z.enum(["PROCESSING", "READY", "CANCELLED", "COLLECTED"]).default("PROCESSING"),
  cancelled: z.boolean().default(false),
  settlements: z.array(z.object({requestId:z.string().uuid(),date:dateSchema,kind:z.enum(["CANCEL","REFUND"]),reason:z.string(),method:z.string(),refund:workOrderMoney,previousTotal:workOrderMoney,total:workOrderMoney,returned:z.array(z.object({productId:z.string(),name:z.string(),quantity:z.number().int().positive()}))})).default([]),
  item: z.string().trim().min(1, "請填寫施工項目").max(6000),
  serial: z.string().trim().max(200).default(""),
  problem: z.string().trim().max(2000).default(""),
  work: z.string().trim().max(2000).default(""),
  note: z.string().trim().max(2000).default(""),
});
export const workOrderSchema = z.object({
  requestId: z.string().uuid(), id: z.string().optional(), revision: z.number().int().positive().optional(),
  date: dateSchema, partyId: z.string().min(1), labor: workOrderMoney.default(0), priceCategory: priceCategorySchema.default("GENERAL"),
  lines: z.array(lineSchema).max(200).default([]), details: workOrderDetailsSchema,
}).refine(v => v.lines.every(l => l.productId !== LABOR_PRODUCT_ID), "工費請使用工費欄位");
export const workOrderPaymentSchema = z.object({
  requestId: z.string().uuid(), orderId: z.string().min(1), date: dateSchema,
  method: z.enum(["現金", "轉帳", "其他"]), amount: workOrderMoney.refine(v => v > 0, "請輸入收款金額"),
});
export const workOrderStatusSchema = z.object({requestId:z.string().uuid(),id:z.string().min(1),revision:z.number().int().positive(),status:z.enum(["PROCESSING","READY","COLLECTED"])});
export const workOrderSettlementSchema = z.object({
  requestId:z.string().uuid(),id:z.string().min(1),revision:z.number().int().positive(),date:dateSchema,
  kind:z.enum(["CANCEL","REFUND"]),reason:z.string().trim().min(1,"請填寫原因").max(1000),
  labor:workOrderMoney,refund:workOrderMoney,method:z.enum(["現金","轉帳","其他"]),
  materials:z.array(z.object({productId:z.string().min(1),returned:z.number().int().nonnegative().max(100000),charge:workOrderMoney})).max(200),
});
export type WorkOrderSettlementInput = z.infer<typeof workOrderSettlementSchema>;
/** Stock returns and financial reductions are explicit, independent choices. */
export function workOrderSettlementPlan(lines:InventoryLine[],paid:number,input:Pick<WorkOrderSettlementInput,"labor"|"refund"|"materials">){
  const materials=lines.filter(l=>l.productId!==LABOR_PRODUCT_ID);
  if(input.materials.length!==materials.length||new Set(input.materials.map(l=>l.productId)).size!==materials.length)throw new Error("請確認每一項材料的退回與收費");
  const kept:InventoryLine[]=[];
  for(const original of materials){
    const choice=input.materials.find(l=>l.productId===original.productId);
    if(!choice||choice.returned>original.quantity)throw new Error("退回數量不可超過工單材料數量");
    const quantity=original.quantity-choice.returned;
    if(choice.charge>original.total||choice.charge>original.unitPrice*quantity||(original.gift&&choice.charge!==0))throw new Error("保留材料費不可超過原金額或未退回材料金額");
    if(quantity)kept.push({...original,quantity,total:choice.charge,discountMode:"AMOUNT",discount:original.unitPrice*quantity-choice.charge});
  }
  const labor=lines.find(l=>l.productId===LABOR_PRODUCT_ID)!;
  kept.push({...labor,quantity:1,unitPrice:input.labor,total:input.labor});
  const total=kept.reduce((n,l)=>n+l.total,0),netPaid=paid-input.refund;
  if(total>2147483647||input.refund>paid||netPaid<0||netPaid>total)throw new Error("退款不可超過淨已收；調低應收後，超收金額必須一併退款");
  return {lines:kept,total,paid:netPaid};
}
export function workOrderProgressLabel(details:WorkOrderDetails){return details.cancelled&&details.status==="COLLECTED"?"已取消・已取件":workOrderStatuses[details.status];}
export function workOrderRefunded(details:WorkOrderDetails){return details.settlements.reduce((sum,s)=>sum+s.refund,0);}
export type WorkOrderDetails = z.infer<typeof workOrderDetailsSchema>;
export type WorkOrderView = InventoryOrderView & { workOrder: WorkOrderDetails };
export function workOrderDetails(value: unknown): WorkOrderDetails | null {
  const result = workOrderDetailsSchema.safeParse(value);
  return result.success ? result.data : null;
}
export function workOrderNumber(order: {id:string; workOrderNumber?:string|null}) { return order.workOrderNumber ? order.workOrderNumber : order.id.toUpperCase(); }
export function formatWorkOrderNumber(date:string, sequence:number) { return date.replaceAll("-", "").slice(2) + String(sequence).padStart(3,"0"); }
/** Flatten legacy fields when opening an old document, without discarding text. */
export function workOrderContent(details: WorkOrderDetails) { return [details.item, details.problem && `問題／需求：${details.problem}`, details.work && `處理內容：${details.work}`].filter(Boolean).join("\n"); }
export function workOrderPaymentLabel(order:Pick<WorkOrderView,"total"|"paid"|"workOrder">){
  if(order.total===0)return order.workOrder.status==="COLLECTED"||order.workOrder.cancelled?"免收費":"未付款";
  return order.paid===0?"未付款":order.paid<order.total?"部分付款":"已付清";
}
