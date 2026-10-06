import { z } from "zod";
export const moneySchema = z.number().int().min(0).max(100000000);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v), "日期不正確");
export const priceCategories = {GENERAL:"一般", CONTRACT:"特約", STUDENT:"學員", FACULTY:"師資", WHOLESALE:"批發"} as const;
export const priceCategorySchema = z.enum(["GENERAL","CONTRACT","STUDENT","FACULTY","WHOLESALE"]);
export type PriceCategory = z.infer<typeof priceCategorySchema>;
const ratio = z.number().min(0).max(100);
export const priceRatiosSchema = z.object({CONTRACT:ratio.optional(),STUDENT:ratio.optional(),FACULTY:ratio.optional(),WHOLESALE:ratio.optional()});
export const productDetailsSchema = z.object({brand:z.string().trim().max(100).default(""),specification:z.string().trim().max(200).default(""),unit:z.string().trim().min(1).max(30).default("件"),code:z.string().trim().max(100).default(""),barcode:z.string().trim().max(100).default(""),minimumStock:z.number().int().min(0).max(1000000).default(0),note:z.string().max(2000).default(""),priceRatios:priceRatiosSchema.default({})});
export type ProductDetails = z.infer<typeof productDetailsSchema>;
export function productDetails(raw:unknown):ProductDetails {const result=productDetailsSchema.safeParse(raw);return result.success?result.data:productDetailsSchema.parse({});}
export function categoryPrice(product:{price:number;priceRatios?:ProductDetails["priceRatios"]},category:PriceCategory) {return Math.round(product.price*(category==="GENERAL"?100:product.priceRatios?.[category]??100)/100);}
export function productSearch(product:{name:string;brand?:string;specification?:string;code?:string;barcode?:string},query:string) {return [product.name,product.brand,product.specification,product.code,product.barcode].join(" ").toLowerCase().includes(query.toLowerCase());}
const id = z.string().min(1).max(160);
export const lineSchema = z.object({ productId: id, quantity: z.number().int().min(1).max(100000), unitPrice: moneySchema, discountMode: z.enum(["NONE", "AMOUNT", "PERCENT"]), discount: z.number().min(0).max(100000000), gift: z.boolean() });
export const orderSchema = z.object({ requestId: z.string().uuid(), id: id.optional(), revision: z.number().int().positive().optional(), kind: z.enum(["SALE", "PURCHASE"]), priceCategory:priceCategorySchema.default("GENERAL"), date: dateSchema, partyId: id, lines: z.array(lineSchema).min(1).max(200), paid: moneySchema, method: z.enum(["現金", "轉帳", "其他", "未付款"]), delivery: z.enum(["自取", "寄送"]).default("自取"), channel: z.enum(["", "超商", "蝦皮", "貨運", "其他"]).default(""), freight: moneySchema.default(0), shippingNote: z.string().max(2000).default(""), internalNote: z.string().max(2000).default("") });
export const paymentSchema = z.object({ requestId: z.string().uuid(), kind: z.enum(["SALE", "PURCHASE"]), date: dateSchema, method: z.enum(["現金", "轉帳", "其他"]), allocations: z.array(z.object({ orderId: id, amount: moneySchema.refine(n => n > 0) })).min(1).max(200) });
export const countSchema = z.object({ requestId: z.string().uuid(), date: dateSchema, reason: z.string().trim().min(1).max(1000), lines: z.array(z.object({ productId: id, revision: z.number().int().positive(), actual: z.number().int().min(0).max(1000000) })).min(1).max(1000) });
export const productSchema = z.object({ id: id.optional(), revision: z.number().int().positive().optional(), name: z.string().trim().min(1).max(200), details:productDetailsSchema.default(productDetailsSchema.parse({})), price: moneySchema, stock: z.number().int().min(0).max(1000000).default(0), averageCost: z.number().min(0).max(100000000).default(0), active: z.boolean().default(true) });
export const supplierSchema = z.object({ id: id.optional(), name: z.string().trim().min(1).max(200), contact: z.string().trim().min(1).max(200), phone: z.string().trim().min(1).max(50), address: z.string().trim().max(1000).default(""), active: z.boolean().default(true) });
export type OrderInput = z.infer<typeof orderSchema>;
export type LineInput = z.infer<typeof lineSchema>;
export type InventoryLine = LineInput & {
    name: string;
    brand?:string;
    specification?:string;
    unit?:string;
    total: number;
    cost?: number;
    pendingCostShares?: Record<string,number>;
};
export type InventoryProductView = Partial<ProductDetails> & {
    id: string;
    name: string;
    stock: number;
    price: number;
    active: boolean;
    revision: number;
    averageCost?: number;
    costPending?: boolean;
};
export type InventoryOrderView = {
    workOrderNumber?:string|null;
    workOrder?: import("./work-orders").WorkOrderDetails | null;
    priceCategory?:PriceCategory;
    actorName?: string;
    id: string;
    kind: string;
    date: string;
    partyId: string;
    partyName: string;
    partyPhone: string;
    lines: InventoryLine[];
    freight: number;
    delivery: string;
    channel: string;
    shippingNote: string;
    internalNote: string;
    total: number;
    paid: number;
    revision: number;
};
export type InventoryPaymentView = {
    actorName?: string;
    id: string;
    kind: string;
    partyId: string;
    partyName: string;
    partyPhone: string;
    date: string;
    method: string;
    total: number;
    allocations: {
        orderId: string;
        amount: number;
        remainingAfter: number;
    }[];
};
export type InventoryData = {
    store: {
        id: string;
        name: string;
        phone: string | null;
        address: string | null;
    };
    receivings?: ReceivingView[];
    canReceive?: boolean;
    canPurchasePay?: boolean;
    canPriceManage?:boolean;
    canPriceOverride?:boolean;
    canCost: boolean;
    canWrite: boolean;
    canManage: boolean;
    canExport: boolean;
    canCreateCustomer: boolean;
    products: InventoryProductView[];
    suppliers: (z.infer<typeof supplierSchema> & {id:string})[];
    orders: InventoryOrderView[];
    payments: InventoryPaymentView[];
    counts: {
        id: string;
        date: string;
        reason: string;
        actorName: string;
        createdAt: string;
        lines: {
            productId: string;
            name: string;
            before: number;
            actual: number;
            difference: number;
        }[];
    }[];
    customers: {
        id: string;
        name: string;
        phone: string;
    }[];
};
export function lineTotal(line: LineInput, kind: "SALE" | "PURCHASE" = "SALE") {
    if (kind === "PURCHASE")
        return line.unitPrice * line.quantity;
    if (line.gift)
        return 0;
    const raw = line.unitPrice * line.quantity;
    if (line.discountMode === "PERCENT" && line.discount > 100)
        throw new Error("折扣百分比不可超過 100");
    const discount = line.discountMode === "AMOUNT" ? line.discount : line.discountMode === "PERCENT" ? raw * line.discount / 100 : 0;
    if (discount > raw)
        throw new Error("折扣不可超過商品金額");
    return Math.round(raw - discount);
}
export function uniqueIds(ids: string[]) { if (new Set(ids).size !== ids.length)
    throw new Error("同一筆商品或單據不可重複，請合併數量"); }
export function publicLines(lines: InventoryLine[], cost: boolean): InventoryLine[] { return lines.map(l => { const { cost: value, pendingCostShares, ...safe } = l; return cost ? { ...safe, cost: value, ...(pendingCostShares ? {pendingCostShares} : {}) } : safe; }); }
export function inventoryReport(orders: InventoryOrderView[], from: string, to: string, daily = false) {
    const rows = new Map<string, {
        date: string;
        name: string;
        sold: number;
        gifts: number;
        total: number;
        cost: number;
        costPending: boolean;
    }>();
    for (const o of orders.filter(o => o.kind === "SALE" && o.date >= from && o.date <= to))
        for (const l of o.lines) {
            const key = (daily ? o.date + ":" : "") + l.productId;
            const r = rows.get(key) || { date: daily ? o.date : "", name: l.name, sold: 0, gifts: 0, total: 0, cost: 0, costPending:false };
            r.sold += l.gift ? 0 : l.quantity;
            r.gifts += l.gift ? l.quantity : 0;
            r.total += l.total;
            r.cost += l.cost || 0;
            r.costPending ||= !!Object.keys(l.pendingCostShares || {}).length;
            rows.set(key, r);
        }
    return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)).map(r => ({ ...r, profit: r.total - r.cost, margin: r.total ? 100 * (r.total - r.cost) / r.total : null }));
}

export type ReceivingLine = {productId:string;name:string;expected:number;received:number;unitCost:number|null};
export type ReceivingView = {id:string;date:string;supplierId:string;supplierName:string;deliveryNumber:string;note:string;lines:ReceivingLine[];revision:number;orderId:string|null;actorName:string;history:{requestId:string;date:string;actorName:string;quantities:{productId:string;quantity:number}[]}[]};
export const receivingSchema = z.object({
 requestId:z.string().uuid(),id:id.optional(),revision:z.number().int().positive().optional(),date:dateSchema,
 supplierId:z.string().max(160).default(""),deliveryNumber:z.string().max(200).default(""),note:z.string().max(2000).default(""),
 lines:z.array(z.object({productId:id,expected:z.number().int().min(1).max(100000),quantity:z.number().int().min(-100000).max(100000)})).min(1).max(200)
});
export const receivingCostSchema=z.object({requestId:z.string().uuid(),id,revision:z.number().int().positive(),supplierId:id,
 lines:z.array(z.object({productId:id,unitCost:moneySchema})).min(1).max(200)});
