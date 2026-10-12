import { NextRequest } from "next/server";
import { z } from "zod";
import { assertStoreMemberWorkorderReviewOnly, STORE_MEMBER_WORKORDER_REVIEW_BRANCH } from "../../../../../scripts/store-member-workorder-review-gate.mjs";

const prefix="qa-member-workorder-20261012:";
const inputSchema=z.object({op:z.enum(["capture","create","dispatch","status"]),outcome:z.enum(["accepted","failed","uncertain"]).default("accepted"),orderId:z.string().optional()});

/** Authenticated synthetic fixtures only, exact branch and isolated database.
 * No production endpoint, real customer, supplied LINE subject or outbound URL. */
export async function POST(request:NextRequest) {
  if(process.env.VERCEL_GIT_COMMIT_REF!==STORE_MEMBER_WORKORDER_REVIEW_BRANCH)return new Response("Not found",{status:404});
  assertStoreMemberWorkorderReviewOnly();
  const [{requirePermission},{prisma}]=await Promise.all([import("@/lib/permissions"),import("@/lib/db")]);
  const actor=await requirePermission("customer.update");
  if(!actor.id.startsWith(prefix)||!actor.storeId)return new Response("Forbidden",{status:403});
  const input=inputSchema.parse(await request.json());
  const customer=await prisma.customer.findFirst({where:{id:prefix+actor.storeId,storeId:actor.storeId},select:{id:true,phone:true}});
  if(!customer)return new Response("Fixture missing",{status:404});
  const [{createHash},{getConfiguredStoreLine}]=await Promise.all([import("node:crypto"),import("@/lib/store-line-config")]);
  const lineUserId="U"+createHash("sha256").update(customer.id).digest("hex").slice(0,32);
  if(input.op==="capture") {
    const store=await prisma.store.findUniqueOrThrow({where:{id:actor.storeId},select:{lineDestination:true}});
    const destination=getConfiguredStoreLine(actor.storeId)?.destination??store.lineDestination??"qa-member-workorder-20261012";
    const {captureStoreMemberConnection}=await import("@/server/services/store-member-connection");
    const result=await captureStoreMemberConnection({storeId:actor.storeId,destination,lineUserId,phone:customer.phone,timestamp:Date.now()});
    return Response.json({result,transport:"synthetic_verified_LINE_source",externalCalls:0});
  }
  if(input.op==="create") {
    const [{saveWorkOrder},{toLocalDateStr},{randomUUID}]=await Promise.all([import("@/server/services/work-orders"),import("@/lib/date-utils"),import("node:crypto")]);
    const id=await saveWorkOrder({requestId:randomUUID(),date:toLocalDateStr(),partyId:customer.id,labor:0,lines:[],details:{item:"QA 取件通知合成工單",serial:"合成驗收",status:"PROCESSING"}});
    return Response.json({orderId:id,externalCalls:0});
  }
  if(!input.orderId)return new Response("Order required",{status:400});
  const order=await prisma.inventoryOrder.findFirst({where:{id:input.orderId,storeId:actor.storeId,partyId:customer.id,kind:"SALE",total:0,paid:0},select:{id:true,revision:true,workOrder:true}});
  if(!order)return new Response("Synthetic order not found",{status:404});
  const event=await prisma.workOrderReadyNotification.findUnique({where:{storeId_orderId:{storeId:actor.storeId,orderId:order.id}},select:{id:true}});
  if(input.op==="dispatch"&&event){const {dispatchWorkOrderReadyIsolatedFixture}=await import("@/server/services/work-order-ready-notification");await dispatchWorkOrderReadyIsolatedFixture(event.id,input.outcome);}
  const latest=event?await prisma.workOrderReadyNotification.findUnique({where:{id:event.id},select:{status:true,attempts:true,errorMessage:true,sentAt:true,retryKey:true}}):null;
  return Response.json({order,notification:latest,externalCalls:0,transport:"local_stub_no_network"});
}
