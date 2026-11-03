"use server";
import {beautyCardHistoryForActor,beautyOwnIncomeForActor,beautyWorkRecordsForActor} from '@/server/beauty/portal-details';
import {beautyMember,beautyWorker} from '@/server/beauty/access';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {handleActionError} from '@/lib/errors';
import {toLocalMonthStr} from '@/lib/date-utils';
async function read<T>(run:()=>Promise<T>){try{return {success:true as const,data:await run()};}catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?'讀取失敗':r.error};}}
async function actor(work:boolean){const a=work?await beautyWorker():await beautyMember();await requireStoreFeature(a.storeId,FEATURES.MEMBER_PORTAL);return a;}
export async function readBeautyCardHistory(cardId:string){return read(async()=>beautyCardHistoryForActor(await actor(false),cardId));}
export async function readBeautyOwnIncome(month=toLocalMonthStr()){return read(async()=>beautyOwnIncomeForActor(await actor(true),month));}
export async function readBeautyWorkRecords(input:unknown){return read(async()=>beautyWorkRecordsForActor(await actor(true),input));}
