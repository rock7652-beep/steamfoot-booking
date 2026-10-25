import {beforeEach,expect,it,vi} from 'vitest';
import type {Prisma} from '../../generated/course-client';
vi.mock('server-only',()=>({}));
vi.mock('@/server/services/cash-day',()=>({lockCashDay:vi.fn()}));
import {collectCourseTrialInTransaction} from '@/server/services/course-trial-payment';
const raw=vi.fn(),create=vi.fn(),find=vi.fn(),prior=vi.fn();
const tx={courseBooking:{findFirst:find},courseTrialPayment:{findUnique:prior,create},$executeRaw:raw} as unknown as Prisma.TransactionClient;
beforeEach(()=>{vi.clearAllMocks();prior.mockResolvedValue(null);create.mockImplementation(async({data})=>({id:'receipt',...data}));});
it.each([[300,120,180],[0,120,-120],[0,0,0],[300,undefined,null]] as const)('locks the trial cost and profit in the receipt audit (%s/%s)',async(price,cost,profit)=>{
 const settings={kind:'single',durationMinutes:60,trialPrice:price,trialDuration:30,providerIds:['teacher'],...(cost===undefined?{}:{trialStoreCost:cost})};
 find.mockResolvedValue({id:'booking',bookingKind:'TRIAL',status:'RESERVED',trialPrice:price,customerName:'學員',trialPayments:[],session:{cancelledAt:null,chargeSnapshot:{planId:'fee',name:'舞蹈',price:600,storeCost:350,settings,trialPrice:price,isTrial:true}}});
 await collectCourseTrialInTransaction(tx,{storeId:'store',userId:'manager'},{bookingId:'booking',requestKey:'request',amount:price,paymentMethod:'OTHER'});
 const audit=raw.mock.calls.find(call=>(call[0] as string[]).join('').includes('AuditLog'))!;
 const value=audit.slice(1).find(v=>typeof v==='string'&&v.includes('pricingSnapshot')) as string;
 expect(JSON.parse(value).pricingSnapshot).toEqual({planId:'fee',storeCost:cost??null,profit});
 expect(find).toHaveBeenCalledWith(expect.objectContaining({where:{id:'booking',storeId:'store',bookingKind:'TRIAL',cardId:null}}));
});
it('replays a confirmed receipt without re-reading or replacing its historical cost',async()=>{
 find.mockResolvedValue({id:'booking',bookingKind:'TRIAL',session:{chargeSnapshot:{invalid:true}}});
 prior.mockResolvedValue({id:'receipt',bookingId:'booking',amount:300,paymentMethod:'OTHER',paymentSplits:null,note:''});
 expect(await collectCourseTrialInTransaction(tx,{storeId:'store',userId:'manager'},{bookingId:'booking',requestKey:'request',amount:300,paymentMethod:'OTHER'})).toMatchObject({id:'receipt'});
 expect(create).not.toHaveBeenCalled();expect(raw).not.toHaveBeenCalled();
});
