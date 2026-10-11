import "server-only";
import type {Prisma} from "../../../generated/spa-client";
import {spaPrisma} from "@/lib/spa-db";
import {resolveCustomerBookingWindow,type CustomerBookingWindowConfig} from "@/lib/shop-config";
import {parseTaipeiDateTime,toLocalDateStr} from "@/lib/date-utils";
import {AppError} from "@/lib/errors";

export async function readSpaCustomerWindow(storeId:string,tx:Pick<Prisma.TransactionClient,"$queryRaw">=spaPrisma){
 const rows=await tx.$queryRaw<CustomerBookingWindowConfig[]>`SELECT "bookableUntilDate","bookingOpensAt","bookingWindowDays" FROM "ShopConfig" WHERE "storeId"=${storeId}`;
 return resolveCustomerBookingWindow(rows[0]);
}
export function assertSpaCustomerDate(date:string,window:Awaited<ReturnType<typeof readSpaCustomerWindow>>){
 const now=new Date();
 if(window.opensAt&&now<window.opensAt)throw new AppError("VALIDATION","本店預約尚未開放");
 if(!parseTaipeiDateTime(date,"00:00")||date<toLocalDateStr(now)||date>toLocalDateStr(window.closesAt))throw new AppError("VALIDATION",`目前開放預約至 ${toLocalDateStr(window.closesAt)}`);
}
export function withinSpaCustomerWindow(date:string,time:string,window:Awaited<ReturnType<typeof readSpaCustomerWindow>>){
 const start=parseTaipeiDateTime(date,time),now=new Date();
 return !!start&&start>now&&start<=window.closesAt&&(!window.opensAt||now>=window.opensAt);
}
