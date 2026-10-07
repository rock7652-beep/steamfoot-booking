import "server-only";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import { publicLines, type InventoryLine } from "@/lib/inventory";
import { correctionSchema, settlementSchema, settlementPlan, settlements } from "@/lib/inventory-settlement";
import { inventoryContext, inventoryTransaction, inventoryAudit, hashInput, assertReplay, createInventoryPayment } from "./inventory";
import { lockCashDay } from "./cash-day";

export async function settleInventory(raw:unknown){
  const v=settlementSchema.parse(raw),ctx=await inventoryContext("inventory.refund");
  if(v.date>toLocalDateStr())throw new AppError("VALIDATION","處理日期不可晚於今天");
  return inventoryTransaction(ctx,async(tx)=>{
    const replay=await tx.inventoryCommand.findUnique({where:{storeId_requestId:{storeId:ctx.storeId,requestId:v.requestId}}});
    if(replay){assertReplay(replay.requestHash,v);return replay.orderId;}
    const o=await tx.inventoryOrder.findFirst({where:{id:v.orderId,storeId:ctx.storeId,kind:"SALE",workOrder:{equals:Prisma.DbNull}}});
    if(!o)throw new AppError("NOT_FOUND","找不到銷貨單，工單請從工單入口處理");
    if(o.revision!==v.revision)throw new AppError("CONFLICT","單據已更新，請重新開啟核對");
    if(v.date<o.date.toISOString().slice(0,10))throw new AppError("VALIDATION","處理日期不可早於銷貨日期");
    const history=settlements(o.settlements);
    if(o.voided&&v.kind!=="REFUND")throw new AppError("BUSINESS_RULE","銷貨單已作廢");
    const receipts=await tx.inventoryPayment.findMany({where:{storeId:ctx.storeId,kind:"SALE",allocations:{array_contains:[{orderId:o.id}]}}});
    const latestReceipt=receipts.filter(p=>(p.allocations as {orderId:string}[]).some(a=>a.orderId===o.id)).map(p=>p.date.toISOString().slice(0,10)).sort().at(-1);
    if(v.date<(latestReceipt??"")||v.date<(history.at(-1)?.date??""))throw new AppError("VALIDATION","處理日期不可早於最近收款或退貨紀錄");
    if(v.exchangeOrderId){
      const exchange=await tx.inventoryOrder.findFirst({where:{id:v.exchangeOrderId,storeId:ctx.storeId,partyId:o.partyId,kind:"SALE",voided:false,workOrder:{equals:Prisma.DbNull}}});
      if(!exchange||exchange.id===o.id)throw new AppError("VALIDATION","換貨須關聯同一顧客的新銷貨單");
    }
    const original=o.lines as unknown as InventoryLine[];
    let plan:ReturnType<typeof settlementPlan>;
    try{plan=settlementPlan(original,o.freight,o.paid,v);}catch(e){throw new AppError("VALIDATION",e instanceof Error?e.message:"退貨資料不正確");}
    for(const line of plan.returned){
      if(!v.lines.find(l=>l.productId===line.productId)?.restock)continue;
      const p=await tx.inventoryProduct.findFirst({where:{id:line.productId,storeId:ctx.storeId}});
      if(!p)throw new AppError("NOT_FOUND","找不到回庫商品");
      const pending=p.pendingCosts as Record<string,number>,shares=line.pendingCostShares??{};
      await tx.inventoryProduct.update({where:{id:p.id},data:{stock:{increment:line.quantity},revision:{increment:1},averageCost:new Prisma.Decimal(p.averageCost).mul(p.stock).add(line.cost??0).div(p.stock+line.quantity),pendingCosts:Object.fromEntries([...new Set([...Object.keys(pending),...Object.keys(shares)])].map(k=>[k,(pending[k]??0)+(shares[k]??0)]))}});
    }
    if(v.refund){
      const date=parseTaiwanDateToDbDate(v.date);
      if(v.method==="現金")await lockCashDay(tx,ctx.storeId,date);
      await tx.cashbookEntry.create({data:{id:`inventory:${v.requestId}:refund`,storeId:ctx.storeId,entryDate:date,type:"EXPENSE",category:"銷貨退款",amount:v.refund,paymentMethod:v.method==="現金"?"CASH":"OTHER",createdByUserId:ctx.user.id,staffId:ctx.user.staffId,customerId:o.partyId,note:`銷貨 ${o.id}・${v.method}・${v.reason}`}});
    }
    const event={requestId:v.requestId,kind:v.kind,date:v.date,reason:v.reason,actorName:ctx.user.name,refund:v.refund,freight:v.freight,method:v.method,exchangeOrderId:v.exchangeOrderId,returned:plan.returned,originalLines:history[0]?.originalLines??original,originalFreight:history[0]?.originalFreight??o.freight,restock:v.lines};
    await tx.inventoryOrder.update({where:{id:o.id},data:{lines:plan.lines as unknown as Prisma.InputJsonValue,total:plan.total,paid:plan.paid,freight:plan.freight,voided:o.voided||v.kind==="VOID",revision:{increment:1},settlements:[...history,event] as unknown as Prisma.InputJsonValue}});
    await tx.inventoryCommand.create({data:{storeId:ctx.storeId,requestId:v.requestId,requestHash:hashInput(v),orderId:o.id}});
    await inventoryAudit(ctx,tx,"InventoryOrder",o.id,v.kind==="VOID"?"作廢銷貨單":v.kind==="REFUND"?"完成銷貨退款":"登錄銷貨退貨",{date:v.date,reason:v.reason,refund:v.refund,total:plan.total,paid:plan.paid,pendingRefund:plan.pendingRefund,returned:publicLines(plan.returned,false),restock:v.lines,exchangeOrderId:v.exchangeOrderId} as unknown as Prisma.InputJsonValue);
    return o.id;
  },v.refund>0);
}

export async function correctInventoryPayment(raw:unknown){
  const v=correctionSchema.parse(raw),ctx=await inventoryContext("inventory.payment.correct");
  if(v.date>toLocalDateStr())throw new AppError("VALIDATION","更正日期不可晚於今天");
  return inventoryTransaction(ctx,async(tx)=>{
    const replay=await tx.inventoryCommand.findUnique({where:{storeId_requestId:{storeId:ctx.storeId,requestId:v.requestId}}});
    if(replay){assertReplay(replay.requestHash,v);return replay.orderId;}
    const p=await tx.inventoryPayment.findFirst({where:{id:v.paymentId,storeId:ctx.storeId,kind:"SALE"}});
    if(!p)throw new AppError("NOT_FOUND","找不到收款單");
    if(p.correction)throw new AppError("BUSINESS_RULE","收款已更正或作廢，請查看最新收款紀錄");
    if(v.date<p.date.toISOString().slice(0,10))throw new AppError("VALIDATION","更正日期不可早於收款日期");
    if(v.method===p.method)throw new AppError("VALIDATION","付款方式沒有變更");
    const allocations=p.allocations as {orderId:string;amount:number}[];
    for(const a of allocations){
      const o=await tx.inventoryOrder.findFirst({where:{id:a.orderId,storeId:ctx.storeId,kind:"SALE"}});
      if(!o||o.workOrder||o.voided||settlements(o.settlements).length||o.paid<a.amount)throw new AppError("BUSINESS_RULE","含工單或已退貨／退款的收款不能作廢，請由原單處理");
      await tx.inventoryOrder.update({where:{id:o.id},data:{paid:{decrement:a.amount},revision:{increment:1}}});
    }
    const cash=await tx.cashbookEntry.findMany({where:{storeId:ctx.storeId,id:{startsWith:`inventory:${p.id}:`}}});
    if(!cash.length||cash.reduce((n,e)=>n+Number(e.amount),0)!==p.total)throw new AppError("BUSINESS_RULE","連動帳不完整，請先核對收款");
    const date=parseTaiwanDateToDbDate(v.date);
    if(cash.some(e=>e.paymentMethod==="CASH")||v.method==="現金")await lockCashDay(tx,ctx.storeId,date);
    for(const e of cash)await tx.cashbookEntry.create({data:{id:`inventory:${v.requestId}:correction:${e.id.split(":").at(-1)}`,storeId:ctx.storeId,entryDate:date,type:"EXPENSE",category:e.category,amount:e.amount,paymentMethod:e.paymentMethod,customerId:p.partyId,createdByUserId:ctx.user.id,staffId:ctx.user.staffId,note:`收款紀錄更正（非退款） ${p.id}・${v.reason}`}});
    // A corrected method is a linked replacement receipt, not a second sale.
    const replacement=v.method?await createInventoryPayment(ctx,tx,{requestId:v.requestId,requestHash:hashInput(v),kind:"SALE",date,method:v.method,allocations}):null;
    await tx.inventoryPayment.update({where:{id:p.id},data:{correction:{date:v.date,reason:v.reason,actorName:ctx.user.name,replacementId:replacement?.id??"",requestId:v.requestId}}});
    await tx.inventoryCommand.create({data:{storeId:ctx.storeId,requestId:v.requestId,requestHash:hashInput(v),orderId:p.id}});
    await inventoryAudit(ctx,tx,"InventoryPayment",p.id,v.method?"更正收款方式":"作廢收款紀錄",{date:v.date,reason:v.reason,replacementId:replacement?.id??"",allocations,method:v.method??""} as unknown as Prisma.InputJsonValue);
    return p.id;
  },true);
}
