import 'server-only';
import {beautyPrisma} from '@/lib/beauty-db';
import {readServiceHoursState} from '@/server/services/service-hours-state';
import type {BeautyPublicCalendar} from '@/lib/beauty/public-calendar';
import {resolveDayRule,buildBusinessHoursMap,buildSpecialDayMap,type BusinessHoursRow,type SpecialDayRow} from '@/lib/business-hours-resolver';
export function projectBeautyPublicCalendar(hours:BusinessHoursRow[],specials:SpecialDayRow[]):BeautyPublicCalendar{
 const businessHoursMap=buildBusinessHoursMap(hours),specialDayMap=buildSpecialDayMap(specials);
 const weekdays=Array.from({length:7},(_,dow)=>!resolveDayRule({dateStr:'2000-01-02',dow,businessHoursMap,specialDayMap:new Map()}).closed);
 const exceptions=Object.fromEntries(specials.map(row=>{const date=row.date.toISOString().slice(0,10);return [date,!resolveDayRule({dateStr:date,dow:new Date(date+'T00:00:00Z').getUTCDay(),businessHoursMap,specialDayMap}).closed];}));
 return {weekdays,exceptions};
}

/** Internal catalog reader; caller must authorize this store through requireBeauty. */
export async function readBeautyPublicCalendar(storeId:string){
 const state=await readServiceHoursState(beautyPrisma as unknown as Parameters<typeof readServiceHoursState>[0],storeId);
 return projectBeautyPublicCalendar(state.hours,state.specials);
}
