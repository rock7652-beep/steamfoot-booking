import 'server-only';
import {addonsPrisma as prisma} from '@/lib/addons-db';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {moduleAddOnGroups} from '@/lib/add-ons';
export async function readBeautyGoodsCatalog(storeId:string){
 // This is the new-selection catalog; historical orders use the Beauty client separately.
 if(!await hasStoreFeature(storeId,FEATURES.ADD_ONS))return {revision:0,enabled:false,groups:[]};
 const catalog=await prisma.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId,module:'BEAUTY'}}});
 const enabled=!!catalog?.enabled&&await hasStoreFeature(storeId,FEATURES.ADD_ONS);
 return {revision:catalog?.revision??0,enabled,groups:enabled?moduleAddOnGroups('BEAUTY',catalog?.groups??[]).filter(g=>g.kind==='SHARED_GOODS'):[]};
}
