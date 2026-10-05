import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requirePermission, checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead, resolveWriteStoreId } from "@/lib/store";
import { recordOperationAudit } from "@/server/services/operation-audit";
import { hasDataExportFeature } from "@/lib/data-export-gate";
import { publicLines, lineTotal, uniqueIds, type InventoryLine, type InventoryData } from "@/lib/inventory";
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
export async function inventoryContext(permission: "inventory.read" | "inventory.write" | "inventory.manage" = "inventory.read") {
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
    return { user, storeId, canCost };
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
export async function inventoryTransaction<T>(ctx: InventoryContext, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(async (tx) => {
        // Store row lock serializes stock, receipt, count and replay checks. No client balances trusted.
        await tx.$queryRaw `SELECT "id" FROM "Store" WHERE "id"=${ctx.storeId} FOR UPDATE`;
        return work(tx);
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
    await requirePermission("cashbook.create");
    if (!await hasStoreFeature(ctx.storeId, FEATURES.CASHBOOK))
        throw new AppError("FORBIDDEN", "請先開通現金收支以連動收付款");
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
    return { store: {id:store.id,name:store.name,phone:null,address:store.shopConfig?.address||null}, canCost: ctx.canCost, canWrite, canManage, canExport, canCreateCustomer,
        products: products.map(p => ({ id: p.id, name: p.name, stock: p.stock, price: p.price, active: p.active, revision: p.revision, ...(ctx.canCost ? { averageCost: Number(p.averageCost) } : {}) })),
        suppliers: suppliers.map(s => ({ id: s.id, name: s.name, contact: s.contact, phone: s.phone, address: s.address, active: s.active })),
        orders: orders.map(o => ({ id: o.id, kind: o.kind, date: o.date.toISOString().slice(0, 10), partyId: o.partyId, partyName: o.partyName, partyPhone: o.partyPhone, lines: publicLines(o.lines as unknown as InventoryLine[], ctx.canCost), freight: o.freight, delivery: o.delivery, channel: o.channel, shippingNote: o.shippingNote, internalNote: o.internalNote, total: o.total, paid: o.paid, revision: o.revision })),
        payments: payments.map(p => ({ id: p.id, kind: p.kind, partyId: p.partyId, partyName: p.partyName, partyPhone: p.partyPhone, date: p.date.toISOString().slice(0, 10), method: p.method, total: p.total, allocations: p.allocations as unknown as InventoryData["payments"][number]["allocations"] })),
        counts: counts.map(c => ({ id: c.id, date: c.date.toISOString().slice(0, 10), reason: c.reason, actorName: c.actorName, createdAt: c.createdAt.toISOString(), lines: c.lines as unknown as InventoryData["counts"][number]["lines"] })), customers };
}
export async function saveInventoryOrder(ctx: InventoryContext, input: import("@/lib/inventory").OrderInput) {
    if (input.kind === "PURCHASE")
        ensureCost(ctx);
    return inventoryTransaction(ctx, async (tx) => {
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
        const beforeAudit = existing ? {date:existing.date.toISOString().slice(0,10),total:existing.total,paid:existing.paid,freight:existing.freight,lines:publicLines(original||[],false)} as unknown as Prisma.InputJsonValue : undefined;
        const originalQuantities = new Map((original || []).map(l => [l.productId, l.quantity]));
        const lines: InventoryLine[] = [];
        let total = 0;
        for (const l of input.lines) {
            const p = await tx.inventoryProduct.findFirst({ where: { id: l.productId, storeId: ctx.storeId, ...(originalQuantities.has(l.productId) ? {} : { active: true }) } });
            if (!p)
                throw new AppError("NOT_FOUND", "商品不存在或已停用");
            const amount = lineTotal(l, input.kind);
            if (amount > 100000000)
                throw new AppError("VALIDATION", "單筆金額過大");
            const available = p.stock + (originalQuantities.get(p.id) || 0);
            if (input.kind === "SALE" && l.quantity > available)
                throw new AppError("BUSINESS_RULE", `${p.name} 庫存不足`);
            const oldLine = original?.find(x => x.productId === p.id);
            const oldQuantity = oldLine?.quantity || 0;
            const oldCost = new Prisma.Decimal(oldLine?.cost || 0);
            const average = new Prisma.Decimal(p.averageCost);
            const cost = input.kind === "PURCHASE" ? new Prisma.Decimal(amount) : oldQuantity ? oldCost.div(oldQuantity).mul(Math.min(oldQuantity, l.quantity)).add(average.mul(Math.max(0, l.quantity - oldQuantity))) : average.mul(l.quantity);
            lines.push({ ...l, gift: input.kind === "SALE" && (l.gift || amount === 0), name: p.name, total: amount, cost: Number(cost.toFixed(6)) });
            total += amount;
            if (input.kind === "PURCHASE")
                await tx.inventoryProduct.update({ where: { id: p.id }, data: { stock: { increment: l.quantity }, averageCost: average.mul(p.stock).add(amount).div(p.stock + l.quantity), revision: { increment: 1 } } });
            else {
                const stock = available - l.quantity;
                const remainingValue = average.mul(p.stock).add(oldCost).sub(cost);
                await tx.inventoryProduct.update({ where: { id: p.id }, data: { stock, averageCost: stock ? remainingValue.div(stock) : average, revision: { increment: 1 } } });
            }
            originalQuantities.delete(p.id);
        }
        // Removed lines return quantity once; costs are preserved for retained lines.
        for (const [id, quantity] of originalQuantities) {
            const p = await tx.inventoryProduct.findFirstOrThrow({ where: { id, storeId: ctx.storeId } });
            const returnedCost = original!.find(l => l.productId === id)!.cost || 0;
            await tx.inventoryProduct.update({ where: { id }, data: { stock: { increment: quantity }, averageCost: new Prisma.Decimal(p.averageCost).mul(p.stock).add(returnedCost).div(p.stock + quantity), revision: { increment: 1 } } });
        }
        const freight = input.kind === "SALE" && input.delivery === "寄送" ? input.freight : 0;
        total += freight;
        if (total > 100000000 || input.paid > total)
            throw new AppError("VALIDATION", "收付款金額不可超過應收／應付金額");
        if (input.method === "未付款" && input.paid !== 0 && !existing)
            throw new AppError("VALIDATION", "未付款金額應為 0");
        if (existing && (input.paid !== existing.paid || total < existing.paid || freight < Math.max(0, existing.paid - (existing.total - existing.freight)) || total - freight < Math.min(existing.paid, existing.total - existing.freight)))
            throw new AppError("BUSINESS_RULE", "已收款不可在編輯中更改或轉移，請使用收款單");
        const orderData = { storeId: ctx.storeId, kind: input.kind, date: new Date(input.date), partyId: party.id, partyName: party.name, partyPhone: party.phone, lines: lines as unknown as Prisma.InputJsonValue, freight, delivery: input.delivery, channel: freight || input.delivery === "寄送" ? input.channel : "", shippingNote: input.delivery === "寄送" ? input.shippingNote : "", internalNote: input.internalNote, total, requestId: input.requestId, requestHash: hashInput(input), actorId: ctx.user.id };
        const order = existing ? await tx.inventoryOrder.update({ where: { id: existing.id }, data: { ...orderData, revision: { increment: 1 } } }) : await tx.inventoryOrder.create({ data: orderData });
        if (!existing && input.paid > 0)
            await createInventoryPayment(ctx, tx, { requestId: input.requestId, requestHash: hashInput(input), kind: input.kind, date: order.date, method: input.method, allocations: [{ orderId: order.id, amount: input.paid }] });
        await tx.inventoryCommand.create({ data: { storeId: ctx.storeId, requestId: input.requestId, requestHash: hashInput(input), orderId: order.id } });
        await inventoryAudit(ctx, tx, "InventoryOrder", order.id, existing ? "編輯銷貨單" : input.kind === "SALE" ? "建立銷貨單" : "建立進貨單", input.kind === "SALE" ? {revision:order.revision,date:input.date,paid:input.paid,total,freight,lines:publicLines(lines,false)} as unknown as Prisma.InputJsonValue : {revision:order.revision,date:input.date,quantities:lines.map(l=>({productId:l.productId,quantity:l.quantity}))}, beforeAudit);
        return order.id;
    });
}
