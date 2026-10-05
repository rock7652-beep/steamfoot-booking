import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requirePermission, checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead, resolveWriteStoreId } from "@/lib/store";
import { recordOperationAudit } from "@/server/services/operation-audit";
import { hasDataExportFeature } from "@/lib/data-export-gate";
import { categoryPrice, productDetails, publicLines, lineTotal, uniqueIds, type InventoryLine, type InventoryData, type InventoryOrderView, type ReceivingLine, type ReceivingView } from "@/lib/inventory";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
export type InventoryContext = Awaited<ReturnType<typeof inventoryContext>>;
export function assertInventoryPreviewIsolation(env: Record<string, string | undefined> = process.env) {
    if (env.VERCEL_ENV !== "preview" || env.VERCEL_GIT_COMMIT_REF !== "feat/inventory-workspace-20261005") return;
    const isolated = (value: string | undefined) => {
        try {
            const url = new URL(value || "");
            const ref = "ttworfzgwejdeolegkxl";
            return ["postgres:", "postgresql:"].includes(url.protocol) && (
                url.hostname === `db.${ref}.supabase.co` ||
                (/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && url.username === `postgres.${ref}`)
            );
        } catch { return false; }
    };
    if (![env.DATABASE_URL, env.DIRECT_URL].every(isolated))
        throw new AppError("FORBIDDEN", "測試版尚未設定隔離資料庫，進銷存操作已暫停");
}
export async function inventoryContext(permission: "inventory.read" | "inventory.write" | "inventory.manage" | "inventory.receive" | "inventory.purchase.pay" = "inventory.read") {
    assertInventoryPreviewIsolation();
    const user = await requirePermission(permission);
    const storeId = permission === "inventory.read" ? await getActiveStoreForRead(user) : await resolveWriteStoreId(user);
    if (!storeId)
        throw new AppError("VALIDATION", "請先選擇門市");
    // Inventory is independently granted, including trial/demo stores. Do not inherit a plan grant.
    const grant = await prisma.storeFeatureEntitlement.findUnique({ where: { uq_store_feature_entitlement: { storeId, featureKey: "inventory" } } });
    if (!grant || grant.status !== "ENABLED" || (grant.startsAt && grant.startsAt > new Date()) || (grant.expiresAt && grant.expiresAt < new Date()))
        throw new AppError("FORBIDDEN", "進銷存尚未開通");
    const canCost = await checkPermission(user.role, user.staffId, "inventory.cost.read");
    return { user, storeId, canCost, permission };
}
export const hashInput = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
export function ensureCost(ctx: InventoryContext) { if (!ctx.canCost)
    throw new AppError("FORBIDDEN", "沒有查看成本的權限"); }
export async function inventoryExportEnabled(storeId: string) {
    const grant = await prisma.storeFeatureEntitlement.findUnique({ where: { uq_store_feature_entitlement: { storeId, featureKey: FEATURES.DATA_EXPORT } } });
    if (grant && grant.status !== "ENABLED")
        return false;
    return hasDataExportFeature(storeId);
}
/** Read current grants through the transaction connection, after the Store lock. */
export async function inventoryTransactionAccess(tx: Prisma.TransactionClient, ctx: InventoryContext) {
    const account = await tx.user.findUnique({ where: { id: ctx.user.id }, select: { role: true, status: true } });
    if (!account || account.status !== "ACTIVE" || account.role !== ctx.user.role)
        throw new AppError("FORBIDDEN", "帳號權限已變更，請重新登入");
    if (account.role === "ADMIN") return () => true;
    const staff = await tx.staff.findFirst({ where: { id: ctx.user.staffId ?? "", userId: ctx.user.id, storeId: ctx.storeId, status: "ACTIVE" },
        select: { permissions: { where: { granted: true }, select: { permission: true } } } });
    if (!staff) throw new AppError("FORBIDDEN", "本店工作權限已停用");
    if (account.role === "OWNER") return () => true;
    const grants = new Set(staff.permissions.map(p => p.permission));
    return (permission: string) => grants.has(permission);
}
type InventoryAccess = Awaited<ReturnType<typeof inventoryTransactionAccess>>;
export async function inventoryTransaction<T>(ctx: InventoryContext, work: (tx: Prisma.TransactionClient, access: InventoryAccess) => Promise<T>, postsCash = false) {
    // Session and feature checks use the shared connection. Resolve them before
    // acquiring a transaction, including deployments with connection_limit=1.
    if (postsCash) {
        await requirePermission("cashbook.create");
        if (!await hasStoreFeature(ctx.storeId, FEATURES.CASHBOOK))
            throw new AppError("FORBIDDEN", "請先開通現金收支以連動收付款");
    }
    return prisma.$transaction(async (tx) => {
        // Store row lock serializes stock, receipt, count and replay checks. No client balances trusted.
        await tx.$queryRaw `SELECT "id" FROM "Store" WHERE "id"=${ctx.storeId} FOR UPDATE`;
        const access = await inventoryTransactionAccess(tx, ctx);
        if (!access(ctx.permission ?? "inventory.write") || (postsCash && !access("cashbook.create")))
            throw new AppError("FORBIDDEN", "操作權限已撤銷，請重新整理");
        return work(tx, access);
    }, { timeout: 20000 });
}
export async function inventoryAudit(ctx: InventoryContext, tx: Prisma.TransactionClient, targetType: string, targetId: string, summary: string, after?: Prisma.InputJsonValue, before?: Prisma.InputJsonValue) {
    // Shared audit history can be read by ordinary staff. Never write costs or internal notes there.
    return recordOperationAudit({ actorUserId: ctx.user.id, actorNameSnapshot: ctx.user.name, storeId: ctx.storeId, module: "SHARED", targetType, targetId, action: "INVENTORY_WRITE", summary, after, before }, tx);
}
export function assertReplay(hash: string, input: unknown) { if (hash !== hashInput(input))
    throw new AppError("CONFLICT", "此送出編號已使用，請重新開啟表單"); }
export async function writeInventoryCash(ctx: InventoryContext, tx: Prisma.TransactionClient, input: {
    paymentId: string;
    date: Date;
    kind: string;
    method: string;
    total: number;
    freight: number;
    partyId: string;
}) {
    if (input.method === "現金") {
        const closed = await tx.cashDrawerSession.findFirst({ where: { storeId: ctx.storeId, businessDate: input.date, status: "CLOSED" }, select: { id: true } });
        if (closed)
            throw new AppError("BUSINESS_RULE", "此日期已結帳，請改用尚未結帳的日期登錄收付款");
    }
    const common = { storeId: ctx.storeId, entryDate: input.date, paymentMethod: input.method === "現金" ? "CASH" as const : "OTHER" as const, createdByUserId: ctx.user.id, staffId: ctx.user.staffId, customerId: input.kind === "SALE" ? input.partyId : null, note: `進銷存 ${input.paymentId}・${input.method}` };
    if (input.kind === "PURCHASE")
        await tx.cashbookEntry.create({ data: { id: `inventory:${input.paymentId}:purchase`, ...common, type: "EXPENSE", category: "進銷存進貨", amount: input.total } });
    else {
        if (input.total - input.freight > 0)
            await tx.cashbookEntry.create({ data: { id: `inventory:${input.paymentId}:goods`, ...common, type: "INCOME", category: "零售-商品銷售", amount: input.total - input.freight } });
        if (input.freight > 0)
            await tx.cashbookEntry.create({ data: { id: `inventory:${input.paymentId}:freight`, ...common, type: "INCOME", category: "運費收入", amount: input.freight } });
    }
}
export async function createInventoryPayment(ctx: InventoryContext, tx: Prisma.TransactionClient, input: {
    requestId: string;
    requestHash: string;
    kind: string;
    date: Date;
    method: string;
    allocations: {
        orderId: string;
        amount: number;
    }[];
}) {
    if (input.kind === "PURCHASE") {
        ensureCost(ctx);
        const access = await inventoryTransactionAccess(tx, ctx);
        if (!access("inventory.cost.read") || !access("inventory.purchase.pay"))
            throw new AppError("FORBIDDEN", "沒有進貨付款或成本權限");
    }
    uniqueIds(input.allocations.map(a => a.orderId));
    let partyId = "", partyName = "", partyPhone = "", freight = 0, total = 0;
    const snapshots = [];
    for (const a of input.allocations) {
        const o = await tx.inventoryOrder.findFirst({ where: { storeId: ctx.storeId, id: a.orderId, kind: input.kind } });
        if (!o || a.amount <= 0 || a.amount > o.total - o.paid || input.date < o.date)
            throw new AppError("BUSINESS_RULE", "收付款不可超過尚欠金額，日期不可早於單據");
        if (partyId && partyId !== o.partyId)
            throw new AppError("VALIDATION", "批次收付款須為同一顧客或廠商");
        partyId = o.partyId;
        partyName = o.partyName;
        partyPhone = o.partyPhone;
        const goods = o.total - o.freight;
        freight += Math.max(0, o.paid + a.amount - goods) - Math.max(0, o.paid - goods);
        total += a.amount;
        snapshots.push({ ...a, remainingAfter: o.total - o.paid - a.amount });
        await tx.inventoryOrder.update({ where: { id: o.id }, data: { paid: { increment: a.amount }, revision: { increment: 1 } } });
    }
    const p = await tx.inventoryPayment.create({ data: { storeId: ctx.storeId, requestId: input.requestId, requestHash: input.requestHash, kind: input.kind, date: input.date, method: input.method, partyId, partyName, partyPhone, total, allocations: snapshots, actorId: ctx.user.id } });
    await writeInventoryCash(ctx, tx, { ...input, paymentId: p.id, partyId, total, freight });
    await inventoryAudit(ctx, tx, "InventoryPayment", p.id, input.kind === "SALE" ? "建立收款單" : "登錄廠商付款", input.kind === "SALE" ? {total,method:input.method,allocations:snapshots} : undefined);
    return p;
}
export async function inventoryData(ctx: InventoryContext): Promise<InventoryData> {
    const [store, products, suppliers, orders, payments, counts, customers, canWrite, canManage, canExport, canCreateCustomer] = await Promise.all([
        prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId }, select: { id: true, name: true, shopConfig: { select: { address: true } } } }),
        prisma.inventoryProduct.findMany({ where: { storeId: ctx.storeId }, orderBy: { createdAt: "asc" } }),
        prisma.inventorySupplier.findMany({ where: { storeId: ctx.storeId }, orderBy: { createdAt: "asc" } }),
        prisma.inventoryOrder.findMany({ where: { storeId: ctx.storeId, ...(!ctx.canCost ? { kind: "SALE" } : {}) }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
        prisma.inventoryPayment.findMany({ where: { storeId: ctx.storeId, ...(!ctx.canCost ? { kind: "SALE" } : {}) }, orderBy: { createdAt: "desc" } }),
        prisma.inventoryStockCount.findMany({ where: { storeId: ctx.storeId }, orderBy: { createdAt: "desc" } }),
        prisma.customer.findMany({ where: { storeId: ctx.storeId, mergedIntoCustomerId: null, NOT: { user: { is: { status: "SUSPENDED" } } } }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
        checkPermission(ctx.user.role, ctx.user.staffId, "inventory.write"), checkPermission(ctx.user.role, ctx.user.staffId, "inventory.manage"), Promise.all([inventoryExportEnabled(ctx.storeId), checkPermission(ctx.user.role, ctx.user.staffId, "report.export")]).then(v => v.every(Boolean)), checkPermission(ctx.user.role, ctx.user.staffId, "customer.create"),
    ]);
    const actorIds=[...new Set([...orders,...payments].map(r=>r.actorId))];
    const actors=actorIds.length?await prisma.user.findMany({where:{id:{in:actorIds}},select:{id:true,name:true}}):[];
    const actorNames=new Map(actors.map(a=>[a.id,a.name]));
    const [canPriceManage,canPriceOverride]=await Promise.all([checkPermission(ctx.user.role,ctx.user.staffId,"inventory.price.manage"),checkPermission(ctx.user.role,ctx.user.staffId,"inventory.price.override")]);
    const canPurchasePay = ctx.canCost && await checkPermission(ctx.user.role,ctx.user.staffId,"inventory.purchase.pay");
    const canReceive = await checkPermission(ctx.user.role,ctx.user.staffId,"inventory.receive");
    const receivingRows = canReceive || canManage ? await prisma.inventoryReceiving.findMany({where:{storeId:ctx.storeId},orderBy:{createdAt:"desc"}}) : [];
    const receivings = receivingRows.map(r=>({...r,date:r.date.toISOString().slice(0,10),lines:(r.lines as unknown as ReceivingLine[]).map(l=>({...l,unitCost:ctx.canCost?l.unitCost:null})),history:r.history as unknown as ReceivingView["history"]}));
    return { receivings, canReceive, canPurchasePay, canPriceManage,canPriceOverride, store: {id:store.id,name:store.name,phone:null,address:store.shopConfig?.address||null}, canCost: ctx.canCost, canWrite, canManage, canExport, canCreateCustomer,
        products: products.map(p => ({ ...productDetails(p.details), id: p.id, name: p.name, stock: p.stock, price: p.price, active: p.active, revision: p.revision, ...(ctx.canCost ? { averageCost: Number(p.averageCost),costPending:Object.keys((p.pendingCosts||{}) as Record<string,number>).length>0 } : {}) })),
        suppliers: suppliers.map(s => ({ id: s.id, name: s.name, contact: s.contact, phone: s.phone, address: s.address, active: s.active })),
        orders: orders.map(o => ({ actorName:actorNames.get(o.actorId)||"", id: o.id, priceCategory:(o.priceCategory || "GENERAL") as InventoryOrderView["priceCategory"], kind: o.kind, date: o.date.toISOString().slice(0, 10), partyId: o.partyId, partyName: o.partyName, partyPhone: o.partyPhone, lines: publicLines(o.lines as unknown as InventoryLine[], ctx.canCost), freight: o.freight, delivery: o.delivery, channel: o.channel, shippingNote: o.shippingNote, internalNote: o.internalNote, total: o.total, paid: o.paid, revision: o.revision })),
        payments: payments.map(p => ({ actorName:actorNames.get(p.actorId)||"", id: p.id, kind: p.kind, partyId: p.partyId, partyName: p.partyName, partyPhone: p.partyPhone, date: p.date.toISOString().slice(0, 10), method: p.method, total: p.total, allocations: p.allocations as unknown as InventoryData["payments"][number]["allocations"] })),
        counts: counts.map(c => ({ id: c.id, date: c.date.toISOString().slice(0, 10), reason: c.reason, actorName: c.actorName, createdAt: c.createdAt.toISOString(), lines: c.lines as unknown as InventoryData["counts"][number]["lines"] })), customers };
}
export async function saveInventoryOrder(ctx: InventoryContext, input: import("@/lib/inventory").OrderInput) {
    if (input.kind === "PURCHASE") {
        ensureCost(ctx);
        if (input.paid > 0) await requirePermission("inventory.purchase.pay");
    }
    return inventoryTransaction(ctx, async (tx, access) => {
        if (input.kind === "PURCHASE" && !access("inventory.cost.read"))
            throw new AppError("FORBIDDEN", "沒有查看成本的權限");
        const canOverride = input.kind === "SALE" && access("inventory.price.override");
        const replay = await tx.inventoryCommand.findUnique({ where: { storeId_requestId: { storeId: ctx.storeId, requestId: input.requestId } } });
        if (replay) {
            assertReplay(replay.requestHash, input);
            return replay.orderId;
        }
        if (input.delivery === "寄送" && !input.channel)
            throw new AppError("VALIDATION", "請選擇寄送管道");
        uniqueIds(input.lines.map(l => l.productId));
        const existing = input.id ? await tx.inventoryOrder.findFirst({ where: { id: input.id, storeId: ctx.storeId, kind: "SALE" } }) : null;
        if (input.id && (!existing || input.kind !== "SALE"))
            throw new AppError("NOT_FOUND", "找不到銷貨單");
        if (existing && (existing.revision !== input.revision || existing.partyId !== input.partyId))
            throw new AppError("CONFLICT", "單據已更新或顧客已變更，請重新開啟");
        const party = input.kind === "SALE" ? await tx.customer.findFirst({ where: { id: input.partyId, storeId: ctx.storeId, mergedIntoCustomerId: null, NOT: { user: { is: { status: "SUSPENDED" } } } } }) : await tx.inventorySupplier.findFirst({ where: { id: input.partyId, storeId: ctx.storeId, active: true } });
        if (!party)
            throw new AppError("NOT_FOUND", "請重新選擇顧客或廠商");
        const original = existing?.lines as unknown as InventoryLine[] | undefined;
        const beforeAudit = existing ? {priceCategory:existing.priceCategory||"GENERAL",date:existing.date.toISOString().slice(0,10),total:existing.total,paid:existing.paid,freight:existing.freight,lines:publicLines(original||[],false)} as unknown as Prisma.InputJsonValue : undefined;
        const originalQuantities = new Map((original || []).map(l => [l.productId, l.quantity]));
        const lines: InventoryLine[] = [];
        let total = 0;
        for (const l of input.lines) {
            const p = await tx.inventoryProduct.findFirst({ where: { id: l.productId, storeId: ctx.storeId, ...(originalQuantities.has(l.productId) ? {} : { active: true }) } });
            if (!p)
                throw new AppError("NOT_FOUND", "商品不存在或已停用");
            const oldLine = original?.find(x => x.productId === p.id);
            const samePricing = existing && (existing.priceCategory || "GENERAL") === input.priceCategory && oldLine && l.unitPrice===oldLine.unitPrice && l.discountMode===oldLine.discountMode && l.discount===oldLine.discount && l.gift===oldLine.gift;
            if(input.kind==="SALE" && !canOverride && !samePricing && (l.unitPrice!==categoryPrice({price:p.price,priceRatios:productDetails(p.details).priceRatios},input.priceCategory)||l.discountMode!=="NONE"||l.discount!==0||l.gift))
                throw new AppError("FORBIDDEN","沒有調整單價與優惠的權限；請使用設定的身份價格");
            const amount = lineTotal(l, input.kind);
            if (amount > 100000000)
                throw new AppError("VALIDATION", "單筆金額過大");
            const available = p.stock + (originalQuantities.get(p.id) || 0);
            if (input.kind === "SALE" && l.quantity > available)
                throw new AppError("BUSINESS_RULE", `${p.name} 庫存不足`);
            const oldQuantity = oldLine?.quantity || 0;
            const oldCost = new Prisma.Decimal(oldLine?.cost || 0);
            const average = new Prisma.Decimal(p.averageCost);
            const cost = input.kind === "PURCHASE" ? new Prisma.Decimal(amount) : oldQuantity ? oldCost.div(oldQuantity).mul(Math.min(oldQuantity, l.quantity)).add(average.mul(Math.max(0, l.quantity - oldQuantity))) : average.mul(l.quantity);
            const pending = (p.pendingCosts || {}) as Record<string,number>;
            const originalShares = oldLine?.pendingCostShares || {};
            const shares = Object.fromEntries([...new Set([...Object.keys(pending),...Object.keys(originalShares)])].map(key => [key,
                (originalShares[key] || 0) * (oldQuantity ? Math.min(oldQuantity,l.quantity)/oldQuantity : 0) +
                (pending[key] || 0) * (p.stock ? Math.max(0,l.quantity-oldQuantity)/p.stock : 0)
            ]).filter(([,value])=>Number(value)>0)) as Record<string,number>;
            lines.push({ ...(Object.keys(shares).length ? {pendingCostShares:shares} : {}), ...l, gift: input.kind === "SALE" && (l.gift || amount === 0), name: oldLine?.name || p.name, brand:oldLine?.brand ?? productDetails(p.details).brand,specification:oldLine?.specification ?? productDetails(p.details).specification,unit:oldLine?.unit ?? productDetails(p.details).unit, total: amount, cost: Number(cost.toFixed(6)) });
            total += amount;
            if (input.kind === "PURCHASE")
                await tx.inventoryProduct.update({ where: { id: p.id }, data: { stock: { increment: l.quantity }, averageCost: average.mul(p.stock).add(amount).div(p.stock + l.quantity), revision: { increment: 1 } } });
            else {
                const stock = available - l.quantity;
                const remainingValue = average.mul(p.stock).add(oldCost).sub(cost);
                await tx.inventoryProduct.update({ where: { id: p.id }, data: { stock, pendingCosts: Object.fromEntries([...new Set([...Object.keys(pending),...Object.keys(originalShares)])].map(key=>[key,(pending[key]||0)+(originalShares[key]||0)-(shares[key]||0)]).filter(([,value])=>Number(value)>0)), averageCost: stock ? remainingValue.div(stock) : average, revision: { increment: 1 } } });
            }
            originalQuantities.delete(p.id);
        }
        // Removed lines return quantity once; costs are preserved for retained lines.
        for (const [id, quantity] of originalQuantities) {
            const p = await tx.inventoryProduct.findFirstOrThrow({ where: { id, storeId: ctx.storeId } });
            const returnedCost = original!.find(l => l.productId === id)!.cost || 0;
            await tx.inventoryProduct.update({ where: { id }, data: { stock: { increment: quantity }, pendingCosts: Object.fromEntries([...new Set([...Object.keys((p.pendingCosts||{}) as Record<string,number>),...Object.keys(original!.find(l=>l.productId===id)?.pendingCostShares||{})])].map(key=>[key,Number((p.pendingCosts as Record<string,number>)?.[key]||0)+Number(original!.find(l=>l.productId===id)?.pendingCostShares?.[key]||0)])), averageCost: new Prisma.Decimal(p.averageCost).mul(p.stock).add(returnedCost).div(p.stock + quantity), revision: { increment: 1 } } });
        }
        const freight = input.kind === "SALE" && input.delivery === "寄送" ? input.freight : 0;
        total += freight;
        if (total > 100000000 || input.paid > total)
            throw new AppError("VALIDATION", "收付款金額不可超過應收／應付金額");
        if (input.method === "未付款" && input.paid !== 0 && !existing)
            throw new AppError("VALIDATION", "未付款金額應為 0");
        if (existing && (input.paid !== existing.paid || total < existing.paid || freight < Math.max(0, existing.paid - (existing.total - existing.freight)) || total - freight < Math.min(existing.paid, existing.total - existing.freight)))
            throw new AppError("BUSINESS_RULE", "已收款不可在編輯中更改或轉移，請使用收款單");
        const orderData = { priceCategory:input.kind==="SALE"?input.priceCategory:"GENERAL", storeId: ctx.storeId, kind: input.kind, date: new Date(input.date), partyId: party.id, partyName: party.name, partyPhone: party.phone, lines: lines as unknown as Prisma.InputJsonValue, freight, delivery: input.delivery, channel: freight || input.delivery === "寄送" ? input.channel : "", shippingNote: input.delivery === "寄送" ? input.shippingNote : "", internalNote: input.internalNote, total, requestId: input.requestId, requestHash: hashInput(input), actorId: ctx.user.id };
        const order = existing ? await tx.inventoryOrder.update({ where: { id: existing.id }, data: { ...orderData, revision: { increment: 1 } } }) : await tx.inventoryOrder.create({ data: orderData });
        if (!existing && input.paid > 0)
            await createInventoryPayment(ctx, tx, { requestId: input.requestId, requestHash: hashInput(input), kind: input.kind, date: order.date, method: input.method, allocations: [{ orderId: order.id, amount: input.paid }] });
        await tx.inventoryCommand.create({ data: { storeId: ctx.storeId, requestId: input.requestId, requestHash: hashInput(input), orderId: order.id } });
        await inventoryAudit(ctx, tx, "InventoryOrder", order.id, existing ? "編輯銷貨單" : input.kind === "SALE" ? "建立銷貨單" : "建立進貨單", input.kind === "SALE" ? {priceCategory:input.priceCategory,revision:order.revision,date:input.date,paid:input.paid,total,freight,lines:publicLines(lines,false)} as unknown as Prisma.InputJsonValue : {revision:order.revision,date:input.date,quantities:lines.map(l=>({productId:l.productId,quantity:l.quantity}))}, beforeAudit);
        return order.id;
    }, !input.id && input.paid > 0);
}

/** Direct print links read only the requested authorized document, never the complete workspace. */
export async function inventoryDocumentData(ctx:InventoryContext,kind:string,id:string):Promise<Pick<InventoryData,"store"|"orders"|"payments">> {
 const [store,order,payment]=await Promise.all([
  prisma.store.findUniqueOrThrow({where:{id:ctx.storeId},select:{id:true,name:true,shopConfig:{select:{address:true}}}}),
  kind==="sale"?prisma.inventoryOrder.findFirst({where:{id,storeId:ctx.storeId,kind:"SALE"}}):null,
  kind==="receipt"?prisma.inventoryPayment.findFirst({where:{id,storeId:ctx.storeId,kind:"SALE"}}):null,
 ]);
 return {store:{id:store.id,name:store.name,phone:null,address:store.shopConfig?.address||null},orders:order?[{id:order.id,priceCategory:order.priceCategory as InventoryOrderView["priceCategory"],kind:order.kind,date:order.date.toISOString().slice(0,10),partyId:order.partyId,partyName:order.partyName,partyPhone:order.partyPhone,lines:publicLines(order.lines as unknown as InventoryLine[],false),freight:order.freight,delivery:order.delivery,channel:order.channel,shippingNote:order.shippingNote,internalNote:"",total:order.total,paid:order.paid,revision:order.revision}]:[],payments:payment?[{id:payment.id,kind:payment.kind,date:payment.date.toISOString().slice(0,10),partyId:payment.partyId,partyName:payment.partyName,partyPhone:payment.partyPhone,method:payment.method,total:payment.total,allocations:payment.allocations as unknown as InventoryData["payments"][number]["allocations"]}]:[]};
}
