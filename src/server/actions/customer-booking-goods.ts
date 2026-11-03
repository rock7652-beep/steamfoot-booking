'use server';
import {z} from 'zod';
import {prisma} from '@/lib/db';
import {addonsPrisma} from '@/lib/addons-db';
import {customerGoodsCatalog} from '@/server/services/customer-booking-goods';
import {handleActionError} from '@/lib/errors';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
/** Only public enabled metadata; no order, identity or payment details. */
export async function readCustomerBookingGoods(input:unknown){try{
 const d=z.object({slug:z.string().min(1).max(100),sessionId:z.string().min(1).max(100).optional()}).parse(input);
 const store=await prisma.store.findUnique({where:{slug:d.slug},select:{id:true}});
 // Check HQ on the existing main client before constructing the optional dedicated client.
 // customerGoodsCatalog repeats the live check on its own connection for enabled stores.
 const catalog=store&&await hasStoreFeature(store.id,FEATURES.ADD_ONS)?await customerGoodsCatalog(addonsPrisma,store.id,d.sessionId):null;
 return {success:true as const,data:catalog?{revision:catalog.revision,groups:catalog.groups}:null};
}catch(e){return handleActionError(e);}}
