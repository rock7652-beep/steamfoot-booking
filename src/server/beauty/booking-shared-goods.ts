import 'server-only';
import {beautyServiceGoodsGroups} from '@/lib/beauty/shared-goods';
import {readBeautyGoodsCatalog} from './shared-goods-catalog';
import {resolveSharedGoods,addOnTotals} from '@/lib/add-ons';
import {AppError} from '@/lib/errors';
import {audit,type BeautyActor} from './access';
import type {Prisma} from '../../../generated/beauty-client';
/** Public metadata only: never exposes orders, receipts, customers or inactive goods. */
export async function publicBeautyGoodsCatalog(storeId:string){
 const c=await readBeautyGoodsCatalog(storeId);
 const groups=c.enabled?c.groups.map(g=>({...g,options:g.options.filter(o=>o.active)})).filter(g=>g.options.length):[];
 return groups.length?{revision:c.revision,groups}:null;
}
/** Runs inside the same booking command; rejects stale prices before any order write. */
export async function prepareBeautyBookingGoods(storeId:string,input?:{revision:number;selections:{id:string;quantity:number}[]},serviceIds:readonly string[]=[]){
 if(!input?.selections.length)return null;
 const c=await readBeautyGoodsCatalog(storeId);
 if(!c.enabled)throw new AppError('CONFLICT','共同商品已停止選購，請重新確認預約');
 if(c.revision!==input.revision)throw new AppError('CONFLICT','商品內容或價格已更新，請重新整理後確認');
 try{const items=resolveSharedGoods(beautyServiceGoodsGroups(c.groups,serviceIds),input.selections);return {items,total:addOnTotals(items).price};}
 catch(e){throw new AppError('VALIDATION',e instanceof Error?e.message:'請核對共同商品');}
}
export async function persistBeautyBookingGoods(tx:Prisma.TransactionClient,a:BeautyActor,groupId:string,goods:{items:ReturnType<typeof resolveSharedGoods>;total:number}|null){
 if(!goods)return;
 const order=await tx.beautySharedGoodsOrder.create({data:{storeId:a.storeId,groupId,...goods}});
 await audit(tx,a,'SHARED_GOODS_ITEMS',JSON.stringify({groupId,orderId:order.id,before:[],after:goods.items,source:'CUSTOMER_BOOKING',commission:'PENDING_PHASE_2'}));
}
