import "server-only";
import { prisma } from "@/lib/db";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
export async function customerLabelFilterIds(storeId:string,labelId?:string):Promise<string[]|null> {
  if(!labelId || !await hasStoreFeature(storeId,FEATURES.CUSTOMER_LABELS))return null;
  const setting=await prisma.customerLabelSetting.findUnique({where:{storeId}});
  if(!setting?.enabled)return null;
  const label=await prisma.customerLabel.findFirst({where:{storeId,id:labelId},select:{id:true}});
  if(!label)return [];
  const rows=await prisma.customerLabelAssignment.findMany({where:{storeId,labelId},select:{customerId:true}});
  return rows.map(r=>r.customerId);
}
