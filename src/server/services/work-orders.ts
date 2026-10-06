import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkPermission } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { productDetails, publicLines, type InventoryLine, type PriceCategory } from "@/lib/inventory";
import { LABOR_PRODUCT_ID, workOrderDetails, workOrderSchema, workOrderPaymentSchema, workOrderStatusSchema, type WorkOrderView } from "@/lib/work-orders";
import { inventoryContext, inventoryTransaction, inventoryAudit, assertReplay, hashInput, saveInventoryOrder, createInventoryPayment, type InventoryContext } from "./inventory";

export async function workOrderData(ctx: InventoryContext, query = "", page = 1, status = "all", payment = "all") {
  const where: Prisma.InventoryOrderWhereInput = { storeId: ctx.storeId, kind: "SALE", workOrder: { not: Prisma.DbNull },
    ...(query.trim() ? { OR: [{ partyName: { contains: query.trim(), mode: "insensitive" } }, { partyPhone: { contains: query.trim() } }, { id: { contains: query.trim().toLowerCase() } }, {workOrderNumber:{contains:query.trim()}}] } : {}) };
  if(status!=="all")where.workOrder={path:["status"],equals:status};
  const unpaid:Prisma.InventoryOrderWhereInput={OR:[{paid:{lt:prisma.inventoryOrder.fields.total}},{total:0,workOrder:{path:["status"],not:"COLLECTED"}}]};
  if(payment!=="all")where.AND=payment==="unpaid"?[unpaid]:[{NOT:unpaid}];
  const [orders, count, store, canWrite, canCollect, inventoryEnabled] = await Promise.all([
    prisma.inventoryOrder.findMany({ where, orderBy: [{ date: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 50 }),
    prisma.inventoryOrder.count({ where }),
    prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId }, select: { id: true, name: true, shopConfig: { select: { address: true } } } }),
    checkPermission(ctx.user.role, ctx.user.staffId, "work_order.write"),
    Promise.all([checkPermission(ctx.user.role, ctx.user.staffId, "cashbook.create"), hasStoreFeature(ctx.storeId, FEATURES.CASHBOOK)]).then(v => v.every(Boolean)),
    hasStoreFeature(ctx.storeId, FEATURES.INVENTORY),
  ]);
  const canCreateCustomer = canWrite && await checkPermission(ctx.user.role,ctx.user.staffId,"customer.create");
  const canChooseCustomer = await checkPermission(ctx.user.role,ctx.user.staffId,"customer.read");
  const canProducts = inventoryEnabled && await checkPermission(ctx.user.role, ctx.user.staffId, "inventory.write");
  const canPriceOverride = canProducts && await checkPermission(ctx.user.role, ctx.user.staffId, "inventory.price.override");
  const products = canProducts ? await prisma.inventoryProduct.findMany({ where: { storeId: ctx.storeId, active: true }, select: { id: true, name: true, price: true, stock: true, details: true }, orderBy: { name: "asc" }, take: 1000 }) : [];
  return { store: { id: store.id, name: store.name, address: store.shopConfig?.address || "" }, canCreateCustomer, canChooseCustomer, canWrite, canCollect: canWrite && canCollect, canProducts, canPriceOverride, products:products.map(p=>({id:p.id,name:p.name,stock:p.stock,price:p.price,...productDetails(p.details)})), count, page,
    orders: orders.map(o => ({ id: o.id, workOrderNumber:o.workOrderNumber, kind: o.kind, date: o.date.toISOString().slice(0,10), partyId: o.partyId, partyName: o.partyName, partyPhone: o.partyPhone,
      lines: publicLines(o.lines as unknown as InventoryLine[], false), priceCategory: (o.priceCategory||"GENERAL") as PriceCategory, freight: o.freight, delivery: o.delivery, channel: o.channel,
      shippingNote: o.shippingNote, internalNote: "", total: o.total, paid: o.paid, revision: o.revision, workOrder: workOrderDetails(o.workOrder)! })) satisfies WorkOrderView[] };
}
export type WorkOrderData = Awaited<ReturnType<typeof workOrderData>>;

export async function saveWorkOrder(raw: unknown) {
  const input = workOrderSchema.parse(raw), ctx = await inventoryContext("work_order.write");
  const existing = input.id ? await prisma.inventoryOrder.findFirst({where:{storeId:ctx.storeId,id:input.id,kind:"SALE",workOrder:{not:Prisma.DbNull}}}) : null;
  if (input.id && !existing) throw new AppError("NOT_FOUND","找不到工單");
  if (input.details.status !== (existing ? workOrderDetails(existing.workOrder)?.status : "PROCESSING")) throw new AppError("VALIDATION","請使用進度操作更新狀態");
  if (input.details.status === "COLLECTED") throw new AppError("BUSINESS_RULE","已取件工單不可更改內容；需要修改請先改回處理中");
  return saveInventoryOrder(ctx, { requestId:input.requestId, id:input.id, revision:input.revision, kind:"SALE", date:input.date, partyId:input.partyId, priceCategory:input.priceCategory,
    lines:[...input.lines,{productId:LABOR_PRODUCT_ID,quantity:1,unitPrice:input.labor,discountMode:"NONE",discount:0,gift:false}], paid:existing?.paid || 0,
    method:"未付款", delivery:"自取", channel:"", freight:0, shippingNote:"", internalNote:existing?.internalNote || "", workOrder:input.details });
}

export async function collectWorkOrder(raw: unknown) {
  const input = workOrderPaymentSchema.parse(raw), ctx = await inventoryContext("work_order.write");
  return inventoryTransaction(ctx, async tx => {
    const old = await tx.inventoryPayment.findUnique({where:{storeId_requestId:{storeId:ctx.storeId,requestId:input.requestId}}});
    if(old) { assertReplay(old.requestHash,input); return old.id; }
    return (await createInventoryPayment(ctx,tx,{requestId:input.requestId,requestHash:hashInput(input),kind:"SALE",date:new Date(input.date),method:input.method,allocations:[{orderId:input.orderId,amount:input.amount}]})).id;
  },true);
}

export async function changeWorkOrderStatus(raw:unknown) {
  const input=workOrderStatusSchema.parse(raw),ctx=await inventoryContext("work_order.write");
  return inventoryTransaction(ctx,async tx=>{
    const old=await tx.inventoryCommand.findUnique({where:{storeId_requestId:{storeId:ctx.storeId,requestId:input.requestId}}});
    if(old){assertReplay(old.requestHash,input);return old.orderId;}
    const order=await tx.inventoryOrder.findFirst({where:{id:input.id,storeId:ctx.storeId,kind:"SALE"}});
    const details=workOrderDetails(order?.workOrder);
    if(!order||!details)throw new AppError("NOT_FOUND","找不到工單");
    if(order.revision!==input.revision)throw new AppError("CONFLICT","工單已更新，請重新開啟");
    await tx.inventoryOrder.update({where:{id:order.id},data:{workOrder:{...details,status:input.status},revision:{increment:1}}});
    await tx.inventoryCommand.create({data:{storeId:ctx.storeId,requestId:input.requestId,requestHash:hashInput(input),orderId:order.id}});
    await inventoryAudit(ctx,tx,"InventoryOrder",order.id,"更新工單進度",{status:input.status},{status:details.status});
    return order.id;
  });
}
