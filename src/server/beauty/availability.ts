import 'server-only';
import {assertBeautyTrialEligibility} from './trial-eligibility';
import {prisma} from '@/lib/db';
import {beautyPrisma} from '@/lib/beauty-db';
import {AppError} from '@/lib/errors';
import {memberPartyInput} from '@/lib/beauty/member-booking';
import {partyInput} from '@/lib/beauty/contracts';
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
    const d=mode==='public'?partyInput.parse(input):await resolveBeautyBookingInput(mode,input,a);
    for(const person of d.people)if(person.isTrial??d.isTrial)await assertBeautyTrialEligibility(beautyPrisma as unknown as Prisma.TransactionClient,a.storeId,person);
    const loaded = await loadAvailability(
      beautyPrisma as unknown as Prisma.TransactionClient,
      a,
      d.date,
    );
    const slots: string[] = [];
    let arrangement:{technicianId:string;technicianName:string;locationId:string;locationName:string}[]|null=null;
    let arrangementError:string|undefined;
    // Public catalog reveals availability only, never names of other customers.
    for (const time of mode==='member'?loaded.memberSlots:loaded.slots) {
      if(mode==='member'&&!/:(00|30)$/.test(time))continue;
      try {
        const allocation=await findAllocation(
          beautyPrisma as unknown as Prisma.TransactionClient,
          a,
          { ...d, time },
          [],
          undefined,
          loaded,
        );
        slots.push(time);
        if(time===d.time&&mode==='manager')arrangement=allocation.result.map(item=>({technicianId:item.technicianId,technicianName:loaded.technicians.find(t=>t.id===item.technicianId)?.name??'',locationId:item.locationId,locationName:''}));
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        if(time===d.time)arrangementError=e.message;
      }
    }
    if(mode!=='manager')return {slots};
    if(arrangement){
      const rooms=await beautyPrisma.$queryRaw<{id:string;name:string}[]>`SELECT id,name FROM "CourseRoom" WHERE "storeId"=${a.storeId} AND "isActive"=true`;
      arrangement=arrangement.map(item=>({...item,locationName:rooms.find(r=>r.id===item.locationId)?.name??''}));
    }
    return { slots,arrangement,...(arrangementError?{arrangementError}:{}) };
}
