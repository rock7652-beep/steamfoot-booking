import {normalizePhone} from "@/lib/normalize";
import {formatTWDateTime,toLocalDateStr} from '@/lib/date-utils';
import {minuteOfDay} from '@/lib/course-availability';
/** Keep the whole opening range (including historical occupations) stable while filtering. */
export function serviceTimelineBounds(periods:{openTime:string;closeTime:string}[],sessions:{startsAt:string;endsAt:string;occupiedStartsAt?:string;occupiedEndsAt?:string}[]){
 const minutes=periods.flatMap(p=>[minuteOfDay(p.openTime),minuteOfDay(p.closeTime)]);
 for(const s of sessions){const start=s.occupiedStartsAt??s.startsAt,end=s.occupiedEndsAt??s.endsAt;minutes.push(minuteOfDay(formatTWDateTime(new Date(start)).slice(11)),toLocalDateStr(new Date(end))>toLocalDateStr(new Date(start))?1440:minuteOfDay(formatTWDateTime(new Date(end)).slice(11)));}
 const firstHour=minutes.length?Math.floor(Math.min(...minutes)/60):9;
 return {firstHour,endHour:Math.max(firstHour+1,minutes.length?Math.ceil(Math.max(...minutes)/60):22)};
}

/** Search only the authorized customer label/phone; service names are not customer matches. */
export function serviceCustomerMatches(customer:{name:string;phone:string},query:string){
 const q=query.trim().toLocaleLowerCase();
 if(!q||customer.name.toLocaleLowerCase().includes(q))return true;
 return /^[+\d ()-]+$/.test(q)&&normalizePhone(customer.phone).replace(/\D/g,'').includes(normalizePhone(q).replace(/\D/g,''))&&/\d/.test(q);
}
