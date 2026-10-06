import { z } from "zod";
import { dateSchema, lineSchema, type InventoryOrderView } from "./inventory";

export const workOrderStatuses = { PROCESSING: "處理中", READY: "待取件", COLLECTED: "已取件" } as const;
export const LABOR_PRODUCT_ID = "__work_order_labor__";
// The database's Int representation is the only storage limit, not a shop fee cap.
export const workOrderMoney = z.number().int().nonnegative().max(2147483647, "金額超出系統可儲存範圍");
export const workOrderDetailsSchema = z.object({
  status: z.enum(["PROCESSING", "READY", "COLLECTED"]).default("PROCESSING"),
  item: z.string().trim().min(1, "請填寫施工／維修項目").max(200),
  serial: z.string().trim().max(200).default(""),
  problem: z.string().trim().max(2000).default(""),
  work: z.string().trim().max(2000).default(""),
  note: z.string().trim().max(2000).default(""),
});
export const workOrderSchema = z.object({
  requestId: z.string().uuid(), id: z.string().optional(), revision: z.number().int().positive().optional(),
  date: dateSchema, partyId: z.string().min(1), labor: workOrderMoney.default(0),
  lines: z.array(lineSchema).max(200).default([]), details: workOrderDetailsSchema,
}).refine(v => v.lines.every(l => l.productId !== LABOR_PRODUCT_ID), "工費請使用工費欄位");
export const workOrderPaymentSchema = z.object({
  requestId: z.string().uuid(), orderId: z.string().min(1), date: dateSchema,
  method: z.enum(["現金", "轉帳", "其他"]), amount: workOrderMoney.refine(v => v > 0, "請輸入收款金額"),
});
export const workOrderStatusSchema = z.object({requestId:z.string().uuid(),id:z.string().min(1),revision:z.number().int().positive(),status:z.enum(["PROCESSING","READY","COLLECTED"])});
export type WorkOrderDetails = z.infer<typeof workOrderDetailsSchema>;
export type WorkOrderView = InventoryOrderView & { workOrder: WorkOrderDetails };
export function workOrderDetails(value: unknown): WorkOrderDetails | null {
  const result = workOrderDetailsSchema.safeParse(value);
  return result.success ? result.data : null;
}
export function workOrderNumber(id: string) { return id.toUpperCase(); }
export function workOrderPaymentLabel(order:Pick<WorkOrderView,"total"|"paid"|"workOrder">){
  if(order.total===0)return order.workOrder.status==="COLLECTED"?"免收費":"未付款";
  return order.paid===0?"未付款":order.paid<order.total?"部分付款":"已付清";
}
