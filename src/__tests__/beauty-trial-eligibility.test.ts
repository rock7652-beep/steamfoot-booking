import {expect,it,vi} from 'vitest';
import {assertBeautyTrialEligibility} from '@/server/beauty/trial-eligibility';
import type {Prisma} from '../../generated/beauty-client';
function fixture(used=0){const count=vi.fn().mockResolvedValue(used);return {count,tx:{beautyAppointment:{count}} as unknown as Prisma.TransactionClient};}
it('checks the same store/service against member identity and public phone history, excluding only cancelled records',async()=>{
 const {tx,count}=fixture();await assertBeautyTrialEligibility(tx,'store',{serviceId:'face',customerId:'member',phone:'0900000000'});expect(count).toHaveBeenCalledWith({where:{storeId:'store',serviceId:'face',isTrial:true,status:{not:'CANCELLED'},OR:[{customerId:'member'},{personPhone:'0900000000'}]}});
});
it('blocks a used service for any caller while a different service can qualify',async()=>{const {tx,count}=fixture(1);await expect(assertBeautyTrialEligibility(tx,'store',{serviceId:'face',phone:'0900000000'})).rejects.toThrow('每人每項服務限體驗一次');count.mockResolvedValue(0);await expect(assertBeautyTrialEligibility(tx,'store',{serviceId:'massage',phone:'0900000000'})).resolves.toBeUndefined();});
it('requires identity for trials and excludes the current item when checking a restoration or identity link',async()=>{const {tx,count}=fixture();await expect(assertBeautyTrialEligibility(tx,'store',{serviceId:'face',phone:''})).rejects.toThrow('補齊顧客身分');expect(count).not.toHaveBeenCalled();await assertBeautyTrialEligibility(tx,'store',{serviceId:'face',customerId:'member',phone:''},'item');expect(count.mock.calls[0][0].where).toMatchObject({OR:[{customerId:'member'}],id:{not:'item'}});});
