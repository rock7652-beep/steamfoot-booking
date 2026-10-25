import 'server-only';
import {beautyReadStep} from './read-timing';
import {assertBeautyTrialEligibility} from './trial-eligibility';
import {prisma} from '@/lib/db';
import {beautyPrisma} from '@/lib/beauty-db';
import {AppError} from '@/lib/errors';
import {memberPartyInput} from '@/lib/beauty/member-booking';
import {partyInput,publicTrialAvailabilityInput} from '@/lib/beauty/contracts';
import type {BeautyActor} from './access';
import {loadAvailability,findAllocation,type BookingPartyInput} from './booking';
import type {Prisma} from '../../../generated/beauty-client';
export async function resolveBeautyBookingInput(mode:"manager"|"member",input:unknown,a:BeautyActor):Promise<BookingPartyInput>{
  if(mode==='manager')return partyInput.parse(input);
  const d=memberPartyInput.parse(input);
  if(d.people.some((p,i)=>i>0&&p.isTrial))throw new AppError('BUSINESS_RULE','同行者體驗須由店家補齊顧客身分後安排');
  const person=await prisma.customer.findFirst({where:{storeId:a.storeId,id:a.customerId,mergedIntoCustomerId:null},select:{id:true,name:true,phone:true}});
  if(!person||!person.phone)throw new AppError('FORBIDDEN','請重新登入或聯絡店家核對會員資料');
  return {...d,memberTrialChoices:true,contactName:person.name,phone:person.phone,isTrial:false,people:d.people.map((p,i)=>({...p,preference:'ANY',customerId:i===0?person.id:null,name:i===0?person.name:`同行者 ${i}`,phone:i===0?person.phone:'',pendingIdentity:i>0}))};
}

export async function beautySlotsForActor(mode:"manager"|"member"|"public",input:unknown,a:BeautyActor){
    // Empty names are internal allocation-only values; no customer/contact is
    // created by a read. Submission still requires the complete partyInput.
    const publicInput=mode==='public'?publicTrialAvailabilityInput.parse(input):null;
    const d=await beautyReadStep('booking-input',async()=>publicInput?{...publicInput,people:publicInput.people.map(p=>({...p,isTrial:true,name:'',customerId:null,cardId:null,notes:''}))}:await resolveBeautyBookingInput(mode as 'manager'|'member',input,a));
    await beautyReadStep('trial-eligibility',async()=>{for(const person of d.people)if(person.isTrial??d.isTrial)await assertBeautyTrialEligibility(beautyPrisma as unknown as Prisma.TransactionClient,a.storeId,person);});
    const loaded = await beautyReadStep('availability-data',()=>loadAvailability(
      beautyPrisma as unknown as Prisma.TransactionClient,
      a,
      d.date,
    ));
    const slots: string[] = [];
    const check=(time:string)=>findAllocation(beautyPrisma as unknown as Prisma.TransactionClient,a,{...d,time},[],undefined,loaded);
    if(mode==='manager'){
      let selectedError:string|undefined;
      try{
        // The backend form needs the chosen arrangement, not a catalog of the day.
        const allocation=await beautyReadStep('selected-allocation',()=>check(d.time));
        const rooms=await beautyReadStep('location-labels',()=>beautyPrisma.$queryRaw<{id:string;name:string}[]>`SELECT id,name FROM "CourseRoom" WHERE "storeId"=${a.storeId} AND "isActive"=true`);
        return {slots:[d.time],arrangement:allocation.result.map(item=>({technicianId:item.technicianId,technicianName:loaded.technicians.find(t=>t.id===item.technicianId)?.name??'',locationId:item.locationId,locationName:rooms.find(r=>r.id===item.locationId)?.name??''}))};
      }catch(error){if(!(error instanceof AppError))throw error;selectedError=error.message;}
      // The form shows at most three alternatives. Prefer nearby choices and stop
      // once those are authoritative, retaining the full scan for public/member catalogs.
      const minute=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
      const candidates=loaded.slots.filter(time=>time!==d.time).sort((a,b)=>Math.abs(minute(a)-minute(d.time))-Math.abs(minute(b)-minute(d.time))||a.localeCompare(b));
      await beautyReadStep('alternative-allocations',async()=>{
        for(const time of candidates){try{await check(time);slots.push(time);if(slots.length===3)break;}catch(error){if(!(error instanceof AppError))throw error;}}
      });
      return {slots:slots.sort(),arrangement:null,arrangementError:selectedError};
    }
    // Public/member catalogs expose availability only, never customer/resource names.
    await beautyReadStep('catalog-allocations',async()=>{
      for(const time of mode==='member'?loaded.memberSlots:loaded.slots){
        if(mode==='member'&&!/:(00|30)$/.test(time))continue;
        try{await check(time);slots.push(time);}catch(error){if(!(error instanceof AppError))throw error;}
      }
    });
    return {slots};
}
