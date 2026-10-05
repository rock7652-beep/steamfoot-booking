import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { receivingSchema, receivingCostSchema, uniqueIds, type ReceivingLine, type ReceivingView, type InventoryLine } from "@/lib/inventory";
import { inventoryContext, inventoryTransaction, inventoryAudit, hashInput, assertReplay, ensureCost } from "./inventory";

export async function receiveInventory(raw:unknown) {
 const input=receivingSchema.parse(raw),ctx=await inventoryContext("inventory.receive");
 await requirePermission("inventory.receive");
 uniqueIds(input.lines.map(l=>l.productId));
 return inventoryTransaction(ctx,async tx=>{
  const replay=await tx.inventoryCommand.findUnique({where:{storeId_requestId:{storeId:ctx.storeId,requestId:input.requestId}}});
  if(replay){assertReplay(replay.requestHash,input);return replay.orderId;}
  const old=input.id?await tx.inventoryReceiving.findFirst({where:{id:input.id,storeId:ctx.storeId}}):null;
  if(input.id&&(!old||old.revision!==input.revision||old.orderId))throw new AppError("CONFLICT","收貨單已更新或已完成，請重新開啟");
  const previous=old?.lines as unknown as ReceivingLine[]|undefined;
  if(previous&&(previous.length!==input.lines.length||previous.some(l=>!input.lines.some(v=>v.productId===l.productId&&v.expected===l.expected))))throw new AppError("VALIDATION","分批收貨請保留原訂品項與數量");
  const supplier=input.supplierId?await tx.inventorySupplier.findFirst({where:{id:input.supplierId,storeId:ctx.storeId,active:true}}):null;
  if(input.supplierId&&!supplier)throw new AppError("NOT_FOUND","找不到廠商");
  const id=old?.id||randomUUID();
  const lines:ReceivingLine[]=[];
  for(const l of input.lines){
   const product=await tx.inventoryProduct.findFirst({where:{id:l.productId,storeId:ctx.storeId,active:true}});
   if(!product)throw new AppError("NOT_FOUND","找不到商品");
   const received=(previous?.find(v=>v.productId===l.productId)?.received||0)+l.quantity;
   if(received<0||received>l.expected||product.stock+l.quantity<0)throw new AppError("BUSINESS_RULE","實收不可超過訂購數量，更正不可造成負庫存");
   if(l.quantity<0&&!input.note.trim())throw new AppError("VALIDATION","更正數量請填寫原因");
   const pending={...(product.pendingCosts as Record<string,number>||{})};
   pending[id]=(pending[id]||0)+l.quantity;
   if(pending[id]<-0.000001)throw new AppError("BUSINESS_RULE","部分收貨已售出，請先補齊成本再處理退貨");
   if(!pending[id])delete pending[id];
   const stock=product.stock+l.quantity;
   await tx.inventoryProduct.update({where:{id:product.id},data:{stock,pendingCosts:pending,averageCost:stock?new Prisma.Decimal(product.averageCost).mul(product.stock).div(stock):product.averageCost,revision:{increment:1}}});
   lines.push({productId:l.productId,name:product.name,expected:l.expected,received,unitCost:null});
  }
  const history=[...(old?.history as unknown as ReceivingView["history"]||[]),{requestId:input.requestId,date:input.date,actorName:ctx.user.name,quantities:input.lines.map(l=>({productId:l.productId,quantity:l.quantity}))}];
  const fields={date:new Date(input.date),supplierId:supplier?.id||"",supplierName:supplier?.name||"",deliveryNumber:input.deliveryNumber,note:input.note,lines:lines as unknown as Prisma.InputJsonValue,history:history as unknown as Prisma.InputJsonValue};
  if(old)await tx.inventoryReceiving.update({where:{id},data:{...fields,revision:{increment:1}}});
  else await tx.inventoryReceiving.create({data:{id,storeId:ctx.storeId,...fields,requestId:input.requestId,requestHash:hashInput(input),actorId:ctx.user.id,actorName:ctx.user.name}});
  await tx.inventoryCommand.create({data:{storeId:ctx.storeId,requestId:input.requestId,requestHash:hashInput(input),orderId:id}});
  await inventoryAudit(ctx,tx,"InventoryReceiving",id,"登錄收貨入庫",{quantities:input.lines.map(l=>({productId:l.productId,quantity:l.quantity}))});
  return id;
 });
}

export async function completeReceiving(raw:unknown) {
 const input=receivingCostSchema.parse(raw),ctx=await inventoryContext("inventory.manage");
 ensureCost(ctx);uniqueIds(input.lines.map(l=>l.productId));
 return inventoryTransaction(ctx,async (tx,access)=>{
  if(!access("inventory.cost.read"))throw new AppError("FORBIDDEN","沒有查看成本的權限");
  const replay=await tx.inventoryCommand.findUnique({where:{storeId_requestId:{storeId:ctx.storeId,requestId:input.requestId}}});
  if(replay){assertReplay(replay.requestHash,input);return replay.orderId;}
  const receipt=await tx.inventoryReceiving.findFirst({where:{id:input.id,storeId:ctx.storeId}});
  if(!receipt||receipt.revision!==input.revision||receipt.orderId)throw new AppError("CONFLICT","收貨單已更新，請重新開啟");
  const supplier=await tx.inventorySupplier.findFirst({where:{id:input.supplierId,storeId:ctx.storeId,active:true}});
  if(!supplier)throw new AppError("NOT_FOUND","請選擇廠商");
  const source=receipt.lines as unknown as ReceivingLine[];
  if(source.some(l=>l.received!==l.expected)||source.length!==input.lines.length)throw new AppError("BUSINESS_RULE","請先完成分批收貨，再確認進貨成本");
  const lines:InventoryLine[]=[];
  const sales=await tx.inventoryOrder.findMany({where:{storeId:ctx.storeId,kind:"SALE"}});
  for(const l of source){
   const value=input.lines.find(v=>v.productId===l.productId);
   if(!value)throw new AppError("VALIDATION","請填齊所有品項成本，贈品可填 0");
   const p=await tx.inventoryProduct.findFirstOrThrow({where:{id:l.productId,storeId:ctx.storeId}});
   const pending={...(p.pendingCosts as Record<string,number>||{})},remaining=pending[receipt.id]||0;
   delete pending[receipt.id];
   await tx.inventoryProduct.update({where:{id:p.id},data:{pendingCosts:pending,averageCost:p.stock?new Prisma.Decimal(p.averageCost).add(new Prisma.Decimal(value.unitCost).mul(remaining).div(p.stock)):p.averageCost,revision:{increment:1}}});
   for(const sale of sales){
    const saleLines=sale.lines as unknown as InventoryLine[];
    let changed=false;
    for(const item of saleLines){
     if(item.productId!==p.id||!item.pendingCostShares?.[receipt.id])continue;
     item.cost=(item.cost||0)+item.pendingCostShares[receipt.id]*value.unitCost;
     delete item.pendingCostShares[receipt.id];changed=true;
    }
    if(changed)await tx.inventoryOrder.update({where:{id:sale.id},data:{lines:saleLines as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
   }
   lines.push({productId:p.id,name:p.name,quantity:l.received,unitPrice:value.unitCost,discountMode:"NONE",discount:0,gift:false,total:l.received*value.unitCost,cost:l.received*value.unitCost});
  }
  const total=lines.reduce((n,l)=>n+l.total,0);
  if(total>100000000)throw new AppError("VALIDATION","單據金額過大");
  const order=await tx.inventoryOrder.create({data:{storeId:ctx.storeId,kind:"PURCHASE",date:receipt.date,partyId:supplier.id,partyName:supplier.name,partyPhone:supplier.phone,lines:lines as unknown as Prisma.InputJsonValue,total,internalNote:receipt.note,requestId:input.requestId,requestHash:hashInput(input),actorId:ctx.user.id}});
  await tx.inventoryReceiving.update({where:{id:receipt.id},data:{supplierId:supplier.id,supplierName:supplier.name,lines:source.map(l=>({...l,unitCost:input.lines.find(v=>v.productId===l.productId)!.unitCost})) as unknown as Prisma.InputJsonValue,orderId:order.id,revision:{increment:1}}});
  await tx.inventoryCommand.create({data:{storeId:ctx.storeId,requestId:input.requestId,requestHash:hashInput(input),orderId:order.id}});
  await inventoryAudit(ctx,tx,"InventoryReceiving",receipt.id,"補齊進貨資料",{orderId:order.id});
  return order.id;
 });
}
