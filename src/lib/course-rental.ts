import { z } from "zod";
export const rentalInput = z.object({
  id:z.string().optional(), revision:z.number().int().positive().optional(), requestKey:z.string().uuid(),
  roomId:z.string().min(1), customerId:z.string().nullable().default(null),
  customerName:z.string().trim().min(1,"請填姓名").max(80), customerPhone:z.string().trim().min(5,"請填電話").max(30).refine(v=>/^\+?[0-9 ()-]{5,30}$/.test(v),"請填正確電話"),
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time:z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
  durationMinutes:z.number().int().min(30).max(720).refine(v=>v%30===0,"以30分鐘為單位"),
  amount:z.number().int().min(0).max(1000000), note:z.string().trim().max(1000).default(""),
});
export function rentalPrice(hourlyRate:number,minutes:number) { return Math.round(hourlyRate*minutes/60); }
export function rentalOccupation(startsAt:Date,endsAt:Date,buffer:number) {
  return {occupiedStartsAt:new Date(startsAt.getTime()-buffer*60000),occupiedEndsAt:new Date(endsAt.getTime()+buffer*60000)};
}
export type RentalDetail = {id:string;roomId:string;customerId:string|null;customerName:string;customerPhone:string;startsAt:string;endsAt:string;amount:number;note:string;revision:number;cancelledAt:string|null;hourlyRateSnapshot:number;payment:{id:string;amount:number;paymentMethod:string}|null};
