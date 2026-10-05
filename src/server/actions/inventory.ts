"use server";
import { revalidatePath } from "next/cache";
import { AppError, handleActionError } from "@/lib/errors";
import { countSchema, orderSchema, paymentSchema, productSchema, supplierSchema, uniqueIds } from "@/lib/inventory";
import { inventoryContext, inventoryData, inventoryTransaction, inventoryAudit, ensureCost, hashInput, assertReplay, createInventoryPayment, saveInventoryOrder } from "@/server/services/inventory";
import type { ActionResult } from "@/types";
async function action<T>(work: () => Promise<T>): Promise<ActionResult<T>> { try {
    const data = await work();
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/cashbook");
        revalidatePath("/dashboard/cash-drawer");
        revalidatePath("/dashboard/revenue");
    return { success: true, data };
}
catch (e) {
    return handleActionError(e);
} }
export async function loadInventory() { try {
    return { success: true as const, data: await inventoryData(await inventoryContext()) };
}
catch (e) {
    return handleActionError(e);
} }
export async function saveProduct(raw: unknown) {
    return action(async () => {
        const c = await inventoryContext("inventory.manage"), v = productSchema.parse(raw);
        ensureCost(c);
        return inventoryTransaction(c, async (tx) => {
            const old = v.id ? await tx.inventoryProduct.findFirst({ where: { id: v.id, storeId: c.storeId } }) : null;
            if (v.id && (!old || old.revision !== v.revision))
                throw new AppError("CONFLICT", "商品已更新，請重新開啟");
            const p = old ? await tx.inventoryProduct.update({ where: { id: old.id }, data: { name: v.name, price: v.price, active: v.active, revision: { increment: 1 } } }) : await tx.inventoryProduct.create({ data: { storeId: c.storeId, name: v.name, price: v.price, stock: v.stock, averageCost: v.averageCost, active: v.active } });
            await inventoryAudit(c, tx, "InventoryProduct", p.id, old ? "編輯商品" : "新增商品", { name: p.name, stock: p.stock, price:p.price,active:p.active });
            return p.id;
        });
    });
}
export async function saveSupplier(raw: unknown) {
    return action(async () => {
        const c = await inventoryContext("inventory.manage"), v = supplierSchema.parse(raw);
        return inventoryTransaction(c, async (tx) => {
            if (v.id && !await tx.inventorySupplier.findFirst({ where: { id: v.id, storeId: c.storeId } }))
                throw new AppError("NOT_FOUND", "找不到廠商");
            const { id, ...fields } = v;
            const s = id ? await tx.inventorySupplier.update({ where: { id }, data: fields }) : await tx.inventorySupplier.create({ data: { ...fields, storeId: c.storeId } });
            await inventoryAudit(c, tx, "InventorySupplier", s.id, "儲存廠商資料", {name:s.name,contact:s.contact,phone:s.phone,address:s.address,active:s.active});
            return s.id;
        });
    });
}
export async function saveOrder(raw: unknown) { return action(async () => { const v = orderSchema.parse(raw), c = await inventoryContext(v.kind === "PURCHASE" ? "inventory.manage" : "inventory.write"); return saveInventoryOrder(c, v); }); }
export async function savePayment(raw: unknown) {
    return action(async () => {
        const v = paymentSchema.parse(raw), c = await inventoryContext(v.kind === "PURCHASE" ? "inventory.manage" : "inventory.write");
        if (v.kind === "PURCHASE")
            ensureCost(c);
        return inventoryTransaction(c, async (tx) => {
            const old = await tx.inventoryPayment.findUnique({ where: { storeId_requestId: { storeId: c.storeId, requestId: v.requestId } } });
            if (old) {
                assertReplay(old.requestHash, v);
                return old.id;
            }
            const p = await createInventoryPayment(c, tx, { ...v, date: new Date(v.date), requestHash: hashInput(v) });
            return p.id;
        }, true);
    });
}
export async function saveStockCount(raw: unknown) {
    return action(async () => {
        const c = await inventoryContext("inventory.manage"), v = countSchema.parse(raw);
        uniqueIds(v.lines.map(l => l.productId));
        return inventoryTransaction(c, async (tx) => {
            const old = await tx.inventoryStockCount.findUnique({ where: { storeId_requestId: { storeId: c.storeId, requestId: v.requestId } } });
            if (old) {
                assertReplay(old.requestHash, v);
                return old.id;
            }
            const lines = [];
            for (const l of v.lines) {
                const p = await tx.inventoryProduct.findFirst({ where: { id: l.productId, storeId: c.storeId } });
                if (!p || p.revision !== l.revision)
                    throw new AppError("CONFLICT", "盤點期間庫存已異動，請重新核對");
                lines.push({ productId: p.id, name: p.name, before: p.stock, actual: l.actual, difference: l.actual - p.stock });
                await tx.inventoryProduct.update({ where: { id: p.id }, data: { stock: l.actual, revision: { increment: 1 } } });
            }
            const count = await tx.inventoryStockCount.create({ data: { storeId: c.storeId, date: new Date(v.date), reason: v.reason, lines, requestId: v.requestId, requestHash: hashInput(v), actorId: c.user.id, actorName: c.user.name } });
            await inventoryAudit(c, tx, "InventoryStockCount", count.id, "完成庫存盤點", { date: v.date, lines });
            return count.id;
        });
    });
}
