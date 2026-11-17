import {CUSTOMER_MESSAGE_LIMIT} from "./customer-message";
export function messageSelectionKey(token:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token))throw new Error("顧客名單連結無效，請返回顧客管理重新選取");
  return `customer-message-selection:${token}`;
}
export function readMessageSelection(raw:string|null,storeId:string,now=Date.now()):string[]{
  let value;try{value=JSON.parse(raw??"null");}catch{throw new Error("顧客名單無法讀取，請返回顧客管理重新選取");}
  if(!value||value.storeId!==storeId||!Number.isFinite(value.createdAt)||value.createdAt>now||now-value.createdAt>15*60_000||!Array.isArray(value.customerIds)||!value.customerIds.length||value.customerIds.length>CUSTOMER_MESSAGE_LIMIT||value.customerIds.some((id:unknown)=>typeof id!=="string"||!id.length||id.length>100)||new Set(value.customerIds).size!==value.customerIds.length)throw new Error("顧客名單已失效或門市已切換，請返回顧客管理重新選取");
  return value.customerIds;
}
