import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkPermission } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { productDetails, publicLines, type InventoryLine, type PriceCategory } from "@/lib/inventory";
import { LABOR_PRODUCT_ID, workOrderDetails, workOrderSchema, workOrderPaymentSchema, workOrderStatusSchema, workOrderSettlementSchema, workOrderSettlementPlan, type WorkOrderView } from "@/lib/work-orders";
import { inventoryFeatureAllowed } from "@/lib/inventory-feature-access";
import { lockCashDay } from "./cash-day";
import { inventoryContext, inventoryTransaction, inventoryAudit, assertReplay, hashInput, saveInventoryOrder, createInventoryPayment, type InventoryContext } from "./inventory";

export async function workOrderData(ctx: InventoryContext, query = "", page = 1, status = "all", payment = "all") {
  const where: Prisma.InventoryOrderWhereInput = { storeId: ctx.storeId, kind: "SALE", workOrder: { not: Prisma.DbNull },
    ...(query.trim() ? { OR: [{ partyName: { contains: query.trim(), mode: "insensitive" } }, { partyPhone: { contains: query.trim() } }, { id: { contains: query.trim().toLowerCase() } }, {workOrderNumber:{contains:query.trim()}}] } : {}) };
  if(status!=="all")where.workOrder={path:["status"],equals:status};
  const unpaid:Prisma.InventoryOrderWhereInput={OR:[{paid:{lt:prisma.inventoryOrder.fields.total}},{AND:[{total:0},{workOrder:{path:["status"],not:"COLLECTED"}},{workOrder:{path:["status"],not:"CANCELLED"}}]}]};
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
  const savedDetails=workOrderDetails(existing?.workOrder);
  if(savedDetails?.cancelled)throw new AppError("BUSINESS_RULE","已取消工單不能重新施工；請建立新工單");
  if (input.details.status !== (existing ? workOrderDetails(existing.workOrder)?.status : "PROCESSING")) throw new AppError("VALIDATION","請使用進度操作更新狀態");
  if (input.details.status === "COLLECTED") throw new AppError("BUSINESS_RULE","已取件工單不可更改內容；需要修改請先改回處理中");
  return saveInventoryOrder(ctx, { requestId:input.requestId, id:input.id, revision:input.revision, kind:"SALE", date:input.date, partyId:input.partyId, priceCategory:input.priceCategory,
    lines:[...input.lines,{productId:LABOR_PRODUCT_ID,quantity:1,unitPrice:input.labor,discountMode:"NONE",discount:0,gift:false}], paid:existing?.paid || 0,
    method:"未付款", delivery:"自取", channel:"", freight:0, shippingNote:"", internalNote:existing?.internalNote || "", workOrder:{...input.details,cancelled:savedDetails?.cancelled??false,settlements:savedDetails?.settlements??[]} });
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
    if(details.cancelled&&input.status!=="COLLECTED")throw new AppError("BUSINESS_RULE","已取消工單只能標記已取件");
    await tx.inventoryOrder.update({where:{id:order.id},data:{workOrder:{...details,status:input.status},revision:{increment:1}}});
    await tx.inventoryCommand.create({data:{storeId:ctx.storeId,requestId:input.requestId,requestHash:hashInput(input),orderId:order.id}});
    await inventoryAudit(ctx,tx,"InventoryOrder",order.id,"更新工單進度",{status:input.status},{status:details.status});
    return order.id;
  });
}

export async function settleWorkOrder(raw:unknown){
  const input=workOrderSettlementSchema.parse(raw),ctx=await inventoryContext("work_order.write");
  return inventoryTransaction(ctx,async(tx,access)=>{
    const replay=await tx.inventoryCommand.findUnique({where:{storeId_requestId:{storeId:ctx.storeId,requestId:input.requestId}}});
    if(replay){assertReplay(replay.requestHash,input);return replay.orderId;}
    const order=await tx.inventoryOrder.findFirst({where:{id:input.id,storeId:ctx.storeId,kind:"SALE"}}),details=workOrderDetails(order?.workOrder);
    if(!order||!details)throw new AppError("NOT_FOUND","找不到工單");
    if(order.revision!==input.revision)throw new AppError("CONFLICT","工單已更新，請重新開啟取消／退款");
    if(input.kind==="CANCEL"&&details.cancelled)throw new AppError("BUSINESS_RULE","工單已取消，不可重複取消");
    const original=order.lines as unknown as InventoryLine[];
    let plan:ReturnType<typeof workOrderSettlementPlan>;
    try{plan=workOrderSettlementPlan(original,order.paid,input);}catch(e){throw new AppError("VALIDATION",e instanceof Error?e.message:"請確認金額");}
    if(input.kind==="REFUND"&&(input.refund===0||plan.total>order.total))throw new AppError("VALIDATION","退款須大於0，且不得增加應收");
    if(input.refund>Math.max(0,order.total-plan.total))throw new AppError("VALIDATION","退款不可超過本次減收金額");
    if(details.cancelled&&plan.total>order.total)throw new AppError("BUSINESS_RULE","已取消工單不得增加應收");
    const returning=input.materials.filter(l=>l.returned>0);
    if(returning.length){
      const [store,grant]=await Promise.all([tx.store.findUnique({where:{id:ctx.storeId},select:{plan:true}}),tx.storeFeatureEntitlement.findUnique({where:{uq_store_feature_entitlement:{storeId:ctx.storeId,featureKey:"inventory"}}})]);
      if(!store||!inventoryFeatureAllowed(store.plan,grant)||!access("inventory.write"))throw new AppError("FORBIDDEN","退回材料須開通進銷存並具銷貨權限");
    }
    for(const choice of input.materials){
      const old=original.find(l=>l.productId===choice.productId)!;
      const proportional=Math.round(old.total*(old.quantity-choice.returned)/old.quantity);
      if(choice.charge!==proportional&&!access("inventory.price.override"))throw new AppError("FORBIDDEN","沒有調整材料收費的權限");
      const kept=plan.lines.find(l=>l.productId===choice.productId);
      const fraction=choice.returned/old.quantity,returnedCost=new Prisma.Decimal(old.cost??0).mul(fraction);
      const shares=old.pendingCostShares??{};
      if(kept){kept.cost=new Prisma.Decimal(old.cost??0).sub(returnedCost).toNumber();kept.pendingCostShares=Object.fromEntries(Object.entries(shares).map(([key,value])=>[key,value*(1-fraction)]).filter(([,value])=>Number(value)>0));}
      if(!choice.returned)continue;
      const product=await tx.inventoryProduct.findFirst({where:{id:choice.productId,storeId:ctx.storeId}});
      if(!product)throw new AppError("NOT_FOUND","找不到退回材料，請確認商品");
      const pending=(product.pendingCosts??{}) as Record<string,number>;
      await tx.inventoryProduct.update({where:{id:product.id},data:{stock:{increment:choice.returned},revision:{increment:1},averageCost:new Prisma.Decimal(product.averageCost).mul(product.stock).add(returnedCost).div(product.stock+choice.returned),pendingCosts:Object.fromEntries([...new Set([...Object.keys(pending),...Object.keys(shares)])].map(key=>[key,(pending[key]??0)+(shares[key]??0)*fraction]))}});
    }
    if(input.refund>0){
      if(input.method==="現金")await lockCashDay(tx,ctx.storeId,new Date(input.date));
      await tx.cashbookEntry.create({data:{id:`inventory:${input.requestId}:refund`,storeId:ctx.storeId,entryDate:new Date(input.date),type:"EXPENSE",category:"工單退款",amount:input.refund,paymentMethod:input.method==="現金"?"CASH":"OTHER",createdByUserId:ctx.user.id,staffId:ctx.user.staffId,customerId:order.partyId,note:`工單 ${order.workOrderNumber??order.id}・${input.method}・${input.reason}`}});
    }
    const settlement={requestId:input.requestId,date:input.date,kind:input.kind,reason:input.reason,method:input.method,refund:input.refund,previousTotal:order.total,total:plan.total,returned:returning.map(c=>({productId:c.productId,name:original.find(l=>l.productId===c.productId)!.name,quantity:c.returned}))};
    await tx.inventoryOrder.update({where:{id:order.id},data:{total:plan.total,paid:plan.paid,lines:plan.lines as unknown as Prisma.InputJsonValue,revision:{increment:1},workOrder:{...details,cancelled:details.cancelled||input.kind==="CANCEL",status:input.kind==="CANCEL"&&details.status!=="COLLECTED"?"CANCELLED":details.status,settlements:[...details.settlements,settlement]}}});
    await tx.inventoryCommand.create({data:{storeId:ctx.storeId,requestId:input.requestId,requestHash:hashInput(input),orderId:order.id}});
    await inventoryAudit(ctx,tx,"InventoryOrder",order.id,input.kind==="CANCEL"?"取消工單":"工單退款",{...settlement,paid:plan.paid,lines:publicLines(plan.lines,false)} as unknown as Prisma.InputJsonValue,{total:order.total,paid:order.paid,lines:publicLines(original,false)} as unknown as Prisma.InputJsonValue);
    return order.id;
  },input.refund>0);
}
