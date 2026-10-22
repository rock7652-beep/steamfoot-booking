import 'server-only';
import {prisma} from '@/lib/db';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
/** Explicit off wins even during a trial; never opens another member's data. */
export async function beautyHealthEnabled(storeId:string){
 const grant=await prisma.storeFeatureEntitlement.findUnique({where:{uq_store_feature_entitlement:{storeId,featureKey:FEATURES.AI_HEALTH_SUMMARY}},select:{status:true,startsAt:true,expiresAt:true}});
 const now=new Date();
 if(grant&&(!grant.startsAt||grant.startsAt<=now)&&(!grant.expiresAt||grant.expiresAt>=now))return grant.status==='ENABLED';
 return hasStoreFeature(storeId,FEATURES.AI_HEALTH_SUMMARY);
}
