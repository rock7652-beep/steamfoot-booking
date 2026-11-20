import "server-only";
import type { StoreOperatingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

const SELECTABLE_STATUSES: StoreOperatingStatus[] = ["ACTIVE", "TRIAL"];
export function isSelectableMemberStoreStatus(status:string){return status==="ACTIVE"||status==="TRIAL";}

/** Selection only: retain verified memberships and existing direct access separately. */
export async function getSelectableMemberMemberships<T extends {storeId:string;storeOperatingStatus:string}>(memberships:readonly T[]):Promise<T[]>{
 const active=memberships.filter(m=>isSelectableMemberStoreStatus(m.storeOperatingStatus));
 if(!active.length)return [];
 const stores=await prisma.store.findMany({
  where:{id:{in:active.map(m=>m.storeId)},archivedAt:null,operatingStatus:{in:SELECTABLE_STATUSES}},
  select:{id:true},
 });
 const ids=new Set(stores.map(store=>store.id));
 return active.filter(m=>ids.has(m.storeId));
}
