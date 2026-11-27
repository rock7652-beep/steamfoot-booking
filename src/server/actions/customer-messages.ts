"use server";
import { after } from "next/server";
import { z } from "zod";
import { customerMessageAccess } from "@/server/services/customer-message-access";
import { previewCustomerMessage,confirmCustomerMessage,cancelCustomerMessage,customerMessageSearch,customerMessageHistory } from "@/server/services/customer-messages";
import { AppError } from "@/lib/errors";
import type { MessageResult } from "@/lib/customer-message";
import {customerMessageSelection} from "@/server/services/customer-messages";
const scope=z.string().min(1).max(100),id=z.string().uuid();
async function action<T>(run:()=>Promise<T>):Promise<MessageResult<T>> {
  try{return {success:true,data:await run()};}
  catch(e){return {success:false,error:e instanceof z.ZodError?e.issues[0]?.message??"請檢查輸入內容":e instanceof AppError||e instanceof Error&&!/prisma|database|SQL|relation|constraint|connection/i.test(e.message)?e.message:"暫時無法處理，請保留內容並稍後再試"};}
}
export async function searchMessageCustomers(storeId:string,filters:unknown,page:number){return action(async()=>{await customerMessageAccess(scope.parse(storeId));return customerMessageSearch(storeId,filters,z.number().int().min(1).max(100000).parse(page));});}
export async function previewMessage(storeId:string,input:unknown){return action(async()=>{const {user}=await customerMessageAccess(scope.parse(storeId));return previewCustomerMessage(storeId,user.id,input);});}
export async function confirmMessage(storeId:string,batchId:string){return action(async()=>{
  const {user}=await customerMessageAccess(scope.parse(storeId));
  const result=await confirmCustomerMessage(storeId,user.id,id.parse(batchId));
  if(result.status==="QUEUED")after(async()=>{try{const {runCustomerMessages}=await import("@/server/services/customer-message-worker");await runCustomerMessages(storeId);}catch{console.error("[customer-messages] delivery deferred to cron");}});
  return result;
});}
export async function cancelMessage(storeId:string,batchId:string){return action(async()=>{await customerMessageAccess(scope.parse(storeId));return cancelCustomerMessage(storeId,id.parse(batchId));});}
export async function loadMessageHistory(storeId:string){return action(async()=>{await customerMessageAccess(scope.parse(storeId));return customerMessageHistory(storeId);});}
export async function loadMessageSelection(storeId:string,customerIds:unknown){return action(async()=>{
  await customerMessageAccess(scope.parse(storeId));
  const ids=z.array(z.string().min(1).max(100)).min(1).max(500).refine(values=>new Set(values).size===values.length,"顧客名單重複，請重新選取").parse(customerIds);
  return customerMessageSelection(storeId,ids);
});}

export async function selectMessageCustomers(storeId:string,filters:unknown){return action(async()=>{await customerMessageAccess(scope.parse(storeId));const result=await customerMessageSearch(storeId,filters,1,500);if(result.total>500)throw new Error("符合顧客超過 500 位，請縮小篩選範圍");return result.rows;});}
