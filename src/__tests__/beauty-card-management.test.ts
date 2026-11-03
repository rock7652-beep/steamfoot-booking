import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({audit:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({audit:m.audit,command:async(_tx:unknown,_a:unknown,_key:unknown,_data:unknown,work:()=>unknown)=>work()}));
import {manageBeautyCard} from '@/server/beauty/card-management';
const actor={storeId:'store',userId:'owner',manager:true};
const card={id:'card',storeId:'store',remaining:4,sessions:5,paid:5000,createdAt:new Date('2026-10-01T01:00Z'),expiresAt:new Date('2027-04-22T15:59:59.999Z'),closedAt:null};
const input={expectedStoreId:'store',requestKey:'00000000-0000-4000-8000-000000000001',cardId:'card',operation:'expiry' as const,expectedRemaining:4,expectedExpiresAt:card.expiresAt.toISOString(),reason:'協商調整',expiresDate:'2027-02-01'};
function fixture(){return {beautyCard:{findFirst:vi.fn().mockResolvedValue({...card}),update:vi.fn()},beautyAppointment:{count:vi.fn().mockResolvedValue(0)},beautyLedger:{create:vi.fn()},beautyPayment:{create:vi.fn()}};}
beforeEach(()=>vi.clearAllMocks());
it.each(['2026-11-01','2027-08-01'])('permits shortening and extending to %s without altering balance or payments',async expiresDate=>{
 const tx=fixture();const result=await manageBeautyCard(tx as never,actor,{...input,expiresDate});
 expect(result).toMatchObject({id:'card',remaining:4,closed:false,expiresAt:expiresDate+'T15:59:59.999Z'});
 expect(tx.beautyCard.update).toHaveBeenCalledWith({where:{id:'card'},data:{expiresAt:new Date(expiresDate+'T15:59:59.999Z')}});
 expect(tx.beautyLedger.create).not.toHaveBeenCalled();expect(tx.beautyPayment.create).not.toHaveBeenCalled();expect(m.audit).toHaveBeenCalledWith(tx,actor,'CARD_EXPIRY',expect.stringContaining('協商調整'));
});
it('closes only unreserved remaining quota, keeps historic payment and appends its reason',async()=>{
 const tx=fixture();await manageBeautyCard(tx as never,actor,{...input,operation:'close'});
 expect(tx.beautyCard.update).toHaveBeenCalledWith({where:{id:'card'},data:{remaining:0,closedAt:expect.any(Date)}});
 expect(tx.beautyLedger.create).toHaveBeenCalledWith({data:{storeId:'store',cardId:'card',kind:'CLOSE',delta:-4,actorUserId:'owner'}});
 expect(tx.beautyPayment.create).not.toHaveBeenCalled();expect(m.audit).toHaveBeenCalledWith(tx,actor,'CLOSE_CARD',expect.stringContaining('協商調整'));
});
it.each(['foreign','changed-balance','changed-expiry','closed','held','booking-beyond-new-date','invalid-date','before-creation'])('blocks %s before any ledger, payment or card write',async kind=>{
 const tx=fixture();let value={...input};
 if(kind==='foreign')value.expectedStoreId='other';
 if(kind==='changed-balance')value.expectedRemaining=5;
 if(kind==='changed-expiry')value.expectedExpiresAt='2027-01-01T15:59:59.999Z';
 if(kind==='closed')tx.beautyCard.findFirst.mockResolvedValue({...card,closedAt:new Date()} as never);
 if(kind==='held'){value={...value,operation:'close' as never};tx.beautyAppointment.count.mockResolvedValue(1);}
 if(kind==='booking-beyond-new-date')tx.beautyAppointment.count.mockResolvedValue(1);
 if(kind==='invalid-date')value.expiresDate='2027-02-30';
 if(kind==='before-creation')value.expiresDate='2026-09-01';
 await expect(manageBeautyCard(tx as never,actor,value)).rejects.toThrow();
 expect(tx.beautyCard.update).not.toHaveBeenCalled();expect(tx.beautyLedger.create).not.toHaveBeenCalled();expect(tx.beautyPayment.create).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
