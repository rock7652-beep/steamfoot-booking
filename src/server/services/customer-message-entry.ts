import "server-only";
import {customerMessageAccess} from "./customer-message-access";
/** Entry visibility uses exactly the same writable store, permission and feature gates as sending. */
export async function customerMessageEntryAllowed(storeId:string|null){
  if(!storeId)return false;
  try{await customerMessageAccess(storeId);return true;}catch{return false;}
}
