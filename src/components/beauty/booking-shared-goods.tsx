'use client';
import {resolveSharedGoods,addOnTotals,type AddOnGroup} from '@/lib/add-ons';
import {SharedGoodsChoices,type GoodsSelection} from '@/components/add-ons/shared-goods-choices';
export type BeautyBookingGoodsCatalog={revision:number;groups:AddOnGroup[]}|null|undefined;
export function beautyBookingGoodsItems(catalog:BeautyBookingGoodsCatalog,selections:GoodsSelection[]){try{return resolveSharedGoods(catalog?.groups??[],selections);}catch{return [];}}
export function beautyBookingGoodsError(catalog:BeautyBookingGoodsCatalog,selections:GoodsSelection[]){try{resolveSharedGoods(catalog?.groups??[],selections);return '';}catch{return '商品已更新，請返回重新選購，或取消選取後再預約。';}}
export function beautyBookingGoodsTotal(catalog:BeautyBookingGoodsCatalog,selections:GoodsSelection[]){return addOnTotals(beautyBookingGoodsItems(catalog,selections)).price;}
export function BeautyBookingGoods({catalog,selections,onChange}:{catalog:BeautyBookingGoodsCatalog;selections:GoodsSelection[];onChange:(next:GoodsSelection[])=>void}){
 if(!catalog?.groups.length&&!selections.length)return null;
 const error=beautyBookingGoodsError(catalog,selections);
 return <section aria-label="共同商品選購" className="min-w-0 space-y-3 rounded-xl border border-earth-200 bg-white p-4"><h2 className="font-semibold text-earth-900">加購商品（選填）</h2><p className="text-earth-600">整組預約共用，請選實際需要的數量。</p>{error&&<div role="alert" className="space-y-2 text-red-700"><p>{error}</p><button type="button" className="min-h-11 rounded-lg border border-earth-200 px-3" onClick={()=>onChange([])}>取消商品選購</button></div>}<SharedGoodsChoices groups={catalog?.groups??[]} selections={selections} onChange={onChange}/></section>;
}
export function BeautyBookingGoodsSummary({catalog,selections}:{catalog:BeautyBookingGoodsCatalog;selections:GoodsSelection[]}){
 const items=beautyBookingGoodsItems(catalog,selections);if(!items.length)return null;
 return <section aria-label="共同商品摘要" className="space-y-2 border-t border-earth-200 pt-3"><h3 className="font-semibold">共同商品</h3>{items.map(i=><div className="flex min-w-0 justify-between gap-3" key={i.id}><span className="break-words">{i.name}{i.quantity>1?` × ${i.quantity}`:''}</span><span className="shrink-0">{i.price?`NT$${(i.price*i.quantity).toLocaleString('zh-TW')}`:'免費'}</span></div>)}<p className="text-earth-600">商品小計 NT${addOnTotals(items).price.toLocaleString('zh-TW')} · 共 {items.reduce((n,i)=>n+i.quantity,0)} 件</p></section>;
}
