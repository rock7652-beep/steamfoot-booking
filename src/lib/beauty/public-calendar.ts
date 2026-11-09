export type BeautyPublicCalendar={weekdays:boolean[];exceptions:Record<string,boolean>};
export function isBeautyPublicDateClosed(calendar:BeautyPublicCalendar|undefined,date:string){
 if(!calendar||!date)return false;
 return !(calendar.exceptions[date]??calendar.weekdays[new Date(date+'T00:00:00Z').getUTCDay()]);
}
