import 'server-only';
import {addonsPrisma as prisma} from '@/lib/addons-db';
import {AddOnsDatabaseConfigurationError} from '@/lib/addons-database-url';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {moduleAddOnGroups} from '@/lib/add-ons';
export async function readBeautyGoodsCatalog(storeId:string){
 // This is the new-selection catalog; historical orders use the Beauty client separately.
 if(!await hasStoreFeature(storeId,FEATURES.ADD_ONS))return {revision:0,enabled:false,groups:[]};
 let catalog;
 try{
  catalog=await prisma.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId,module:'BEAUTY'}}});
 }catch(error){
  // Optional new selections must not take down the schedule or booking entry.
  // Existing goods/payment records stay authoritative in the Beauty database;
  // goods submissions see enabled=false and remain blocked until configured.
  if(error instanceof AddOnsDatabaseConfigurationError)return {revision:0,enabled:false,groups:[]};
  throw error;
 }
 const allowed=!!catalog&&await hasStoreFeature(storeId,FEATURES.ADD_ONS);
 const groups=allowed?moduleAddOnGroups('BEAUTY',catalog?.groups??[]).filter(g=>g.kind==='SHARED_GOODS'):[];
 return {revision:catalog?.revision??0,enabled:groups.some(g=>g.options.some(o=>o.active)),groups};
}

