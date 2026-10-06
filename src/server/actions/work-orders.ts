"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { handleActionError } from "@/lib/errors";
import { inventoryContext } from "@/server/services/inventory";
import { workOrderData, saveWorkOrder, collectWorkOrder, changeWorkOrderStatus, settleWorkOrder } from "@/server/services/work-orders";

export async function loadWorkOrders(raw:unknown) {
  try { const {query,page,status,payment}=z.object({query:z.string().max(200).default(""),page:z.number().int().min(1).max(100000).default(1),status:z.enum(["all","PROCESSING","READY","CANCELLED","COLLECTED"]).default("all"),payment:z.enum(["all","unpaid","paid"]).default("all")}).parse(raw);
    return {success:true as const,data:await workOrderData(await inventoryContext("work_order.read"),query,page,status,payment)};
  } catch(e){return handleActionError(e);}
}
async function mutate(work:()=>Promise<string>) {
  try {const data=await work();
    for(const path of ["/dashboard/work-orders","/dashboard/inventory","/dashboard/cashbook","/dashboard/revenue","/dashboard/reports","/dashboard/cash-drawer","/dashboard/reconciliation"])revalidatePath(path);
    return {success:true as const,data};
  } catch(e){return handleActionError(e);}
}
export async function saveWorkOrderAction(raw:unknown){return mutate(()=>saveWorkOrder(raw));}
export async function collectWorkOrderAction(raw:unknown){return mutate(()=>collectWorkOrder(raw));}
export async function changeWorkOrderStatusAction(raw:unknown){return mutate(()=>changeWorkOrderStatus(raw));}
export async function settleWorkOrderAction(raw:unknown){return mutate(()=>settleWorkOrder(raw));}
