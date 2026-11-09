import {z} from 'zod';
import {sharedGoodsSelection,type AddOnGroup} from './add-ons';
export const customerBookingGoodsInput=z.object({revision:z.number().int().nonnegative(),selections:sharedGoodsSelection}).strict();
export type CustomerBookingGoodsInput=z.infer<typeof customerBookingGoodsInput>;
export type CustomerBookingGoodsCatalog={revision:number;groups:AddOnGroup[]};
export type CustomerBookingGoodsDraft={scope:string;input:CustomerBookingGoodsInput;total:number;items:ReturnType<typeof import("./add-ons").resolveSharedGoods>};
export const goodsScope=(slug:string,sessionId?:string)=>JSON.stringify([slug,sessionId??null]);
export function bookingGoodsInput(draft:CustomerBookingGoodsDraft|undefined,slug:string,sessionId?:string){return draft?.scope===goodsScope(slug,sessionId)&&draft.input.selections.length?draft.input:undefined;}
export function bookingGoodsTotal(draft:CustomerBookingGoodsDraft|undefined,slug:string,sessionId?:string){return bookingGoodsInput(draft,slug,sessionId)?draft!.total:0;}
