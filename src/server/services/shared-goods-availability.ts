import 'server-only';
import {cache} from 'react';
import {addonsPrisma as prisma} from '@/lib/addons-db';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {courseSubjectAddOnGroups,moduleAddOnGroups} from '@/lib/add-ons';
/** Visibility only; mutations always repeat authorization and live balance checks. */
export const sharedGoodsAvailable=cache(async(storeId:string,module:'STEAMFOOT'|'FITNESS'|'MUSIC',bookingId?:string,subjectId?:string|null)=>{
 const historical=await prisma.serviceAddOnOrder.findFirst({where:{storeId,module,ownership:'RESERVATION',...(bookingId?{bookingId}:{})},select:{id:true}});
 if(historical)return true;
 if(!await hasStoreFeature(storeId,FEATURES.ADD_ONS))return false;
 const catalog=await prisma.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId,module}},select:{groups:true}});
 if(!catalog)return false;
 const groups=bookingId&&(module==='FITNESS'||module==='MUSIC')?courseSubjectAddOnGroups(module,catalog.groups,subjectId):moduleAddOnGroups(module,catalog.groups);
 return groups.some(g=>g.kind==='SHARED_GOODS'&&g.options.some(o=>o.active));
});
