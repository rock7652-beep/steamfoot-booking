import 'server-only';
import {z} from 'zod';
import type {Prisma} from '../../../generated/beauty-client';
import {money} from '@/lib/beauty/contracts';
const configuration=z.object({id:z.string().min(1),kind:z.enum(['single','plan']),revision:z.number().int().nonnegative(),storeCost:money.nullable().optional()});
/** Finance configuration stays in the existing immutable audit stream. Legacy rule JSON stays unchanged. */
export async function readBeautyChargeCosts(tx:Pick<Prisma.TransactionClient,'beautyEvent'>,storeId:string,charges:{kind:'single'|'plan';id:string}[]){
 const unique=[...new Map(charges.map(c=>[c.kind+':'+c.id,c])).values()];
 const rows=unique.length?await tx.beautyEvent.findMany({where:{storeId,status:'AUDIT',kind:'CHARGE_SETTING',OR:unique.map(c=>({body:{contains:JSON.stringify({id:c.id}).slice(1,-1)}}))},select:{body:true},orderBy:[{createdAt:'desc'},{id:'desc'}]}):[];
 const latest=new Map<string,{revision:number;cost:number|null}>();
 for(const row of rows){try{const value=configuration.parse(JSON.parse(row.body)),key=value.kind+':'+value.id;if(!unique.some(c=>c.kind===value.kind&&c.id===value.id))continue;if((latest.get(key)?.revision??-1)<value.revision)latest.set(key,{revision:value.revision,cost:value.storeCost??null});}catch{/* Malformed audit records cannot supply financial settings. */}}
 return new Map(unique.map(c=>[c.kind+':'+c.id,latest.get(c.kind+':'+c.id)?.cost??null]));
}
export async function readBeautyServiceCost(tx:Pick<Prisma.TransactionClient,'beautyEvent'>,storeId:string,appointmentId:string){
 const row=await tx.beautyEvent.findFirst({where:{storeId,appointmentId,status:'AUDIT',kind:'SERVICE_FINANCE_RULE'},select:{body:true},orderBy:[{createdAt:'asc'},{id:'asc'}]});
 if(!row)return null;
 try{return z.object({storeCost:money.nullable()}).parse(JSON.parse(row.body)).storeCost;}catch{return null;}
}
