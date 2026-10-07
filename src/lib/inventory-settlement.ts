import { z } from "zod";
import { dateSchema, moneySchema, type InventoryLine } from "./inventory";

export const settlementSchema = z.object({
  requestId: z.string().uuid(), orderId: z.string().min(1), revision: z.number().int().positive(),
  kind: z.enum(["RETURN", "VOID", "REFUND"]), date: dateSchema,
  reason: z.string().trim().min(1, "請填寫原因").max(1000),
  method: z.enum(["現金", "轉帳", "其他"]), refund: moneySchema,
  freight: moneySchema, lines: z.array(z.object({productId:z.string().min(1), quantity:z.number().int().min(1), restock:z.boolean()})).max(200),
  exchangeOrderId: z.string().default(""),
});
export type SettlementInput = z.infer<typeof settlementSchema>;
export type InventorySettlement = {
  requestId:string; kind:SettlementInput["kind"]; date:string; reason:string; actorName:string;
  refund:number; freight:number; method:string; exchangeOrderId:string;
  restock?:{productId:string;quantity:number;restock:boolean}[];
  returned:InventoryLine[]; originalLines:InventoryLine[]; originalFreight:number;
};
export function settlements(raw:unknown):InventorySettlement[] { return Array.isArray(raw)?raw as InventorySettlement[]:[]; }
export function settlementPlan(lines:InventoryLine[], freight:number, paid:number, input:SettlementInput) {
  if(new Set(input.lines.map(l=>l.productId)).size!==input.lines.length)throw new Error("退貨商品不可重複");
  if(input.freight>freight)throw new Error("退還運費不可超過原單剩餘運費");
  if(input.kind==="REFUND"&&(input.lines.length||input.freight))throw new Error("退款不調整商品或運費，請先登錄退貨");
  const choices=new Map(input.lines.map(l=>[l.productId,l]));
  if(input.lines.some(l=>!lines.some(old=>old.productId===l.productId)))throw new Error("找不到退貨商品");
  const kept:InventoryLine[]=[],returned:InventoryLine[]=[];
  for(const l of lines){
    const q=choices.get(l.productId)?.quantity??0;
    if(q>l.quantity)throw new Error("退貨數量超過尚可退數量");
    // Cumulative rounding makes a final full return exactly equal the original charge.
    const remaining=l.quantity-q, keepAmount=Math.round(l.total*remaining/l.quantity);
    if(q) returned.push({...l,quantity:q,total:l.total-keepAmount,discount:l.discountMode==="AMOUNT"&&!l.gift?l.unitPrice*q-(l.total-keepAmount):l.discount,cost:(l.cost??0)*q/l.quantity,pendingCostShares:Object.fromEntries(Object.entries(l.pendingCostShares??{}).map(([k,v])=>[k,v*q/l.quantity]))});
    if(remaining)kept.push({...l,quantity:remaining,total:keepAmount,discount:l.discountMode==="AMOUNT"&&!l.gift?l.unitPrice*remaining-keepAmount:l.discount,cost:(l.cost??0)*remaining/l.quantity,pendingCostShares:Object.fromEntries(Object.entries(l.pendingCostShares??{}).map(([k,v])=>[k,v*remaining/l.quantity]))});
  }
  if(input.kind==="VOID"&&(kept.length||input.freight!==freight))throw new Error("作廢必須處理全部商品與運費");
  if(input.kind==="RETURN"&&!returned.length&&!input.freight)throw new Error("請選擇退貨商品或退還運費");
  const total=kept.reduce((n,l)=>n+l.total,0)+freight-input.freight;
  const maximumRefund=Math.max(0,paid-total);
  if(input.refund>maximumRefund)throw new Error("退款不可超過已收款扣除保留商品後的金額");
  if(input.kind==="REFUND"&&!input.refund)throw new Error("請填寫退款金額");
  const netPaid=paid-input.refund;
  return {lines:kept,returned,freight:freight-input.freight,total,paid:netPaid,maximumRefund,pendingRefund:Math.max(0,netPaid-total),remaining:Math.max(0,total-netPaid)};
}
export const correctionSchema=z.object({requestId:z.string().uuid(),paymentId:z.string().min(1),date:dateSchema,reason:z.string().trim().min(1).max(1000),method:z.enum(["現金","轉帳","其他"]).optional()});
