import {it,expect,vi} from 'vitest';
import type {Prisma} from '@prisma/client';
import {correctWalletSession} from '@/server/services/wallet-session-correction';
import {walletSessionCorrectionInput,type WalletSessionCorrectionInput} from '@/lib/wallet-session-correction';

const actor={storeId:'store',userId:'owner',name:'店長',role:'OWNER'};
const input:WalletSessionCorrectionInput={expectedStoreId:'store',walletId:'wallet',customerId:'customer',sessionId:'session',expectedStatus:'BACKFILLED',expectedUpdatedAt:'2026-11-11T02:00:00.000Z',requestKey:'00000000-0000-4000-8000-000000000001',reason:'原日期填錯'};
function fixture(status='BACKFILLED'){
  let session={id:'session',walletId:'wallet',sessionNo:1,status,bookingId:null as string|null,reservedAt:null,completedAt:new Date('2026-11-09T00:00Z'),voidedAt:status==='VOIDED'?new Date('2026-11-11T01:00Z'):null,voidReason:'原原因',voidedByStaffId:'staff',voidedByStaff:{displayName:'原操作者'},updatedAt:new Date(input.expectedUpdatedAt),createdAt:new Date('2026-10-01T00:00Z')};
  const wallet={status:'USED_UP',remainingSessions:0};const receipts=new Map<string,unknown>();
  const tx={
    auditLog:{findUnique:vi.fn(async({where}:{where:{id:string}})=>receipts.get(where.id)??null),create:vi.fn(async({data}:{data:{id:string}})=>{receipts.set(data.id,data);return data;})},
    walletSession:{findFirst:vi.fn(async()=>({...session})),updateMany:vi.fn(async()=>{session={...session,status:'AVAILABLE',completedAt:null as never,voidedAt:null,voidReason:null as never,voidedByStaffId:null as never,updatedAt:new Date('2026-11-11T03:00Z')};return {count:1};}),groupBy:vi.fn(async()=>[{status:session.status,_count:{_all:1}}])},
    customerPlanWallet:{findFirst:vi.fn(async()=>wallet),findUnique:vi.fn(async()=>wallet),findUniqueOrThrow:vi.fn(async()=>wallet),update:vi.fn(async({data}:{data:{remainingSessions:number;status:string}})=>Object.assign(wallet,data))},
  };
  return {tx:tx as unknown as Prisma.TransactionClient,m:tx,wallet,getSession:()=>session,setStatus:(value:string)=>{session.status=value;},bind:()=>{session.bookingId='booking';}};
}
it.each(['BACKFILLED','VOIDED'] as const)('restores %s once, snapshots the original date/reason/operator and reactivates a used-up wallet',async status=>{
  const f=fixture(status),d={...input,expectedStatus:status};const record=await correctWalletSession(f.tx,actor,d);
  expect(f.getSession()).toMatchObject({status:'AVAILABLE',completedAt:null,voidedAt:null,voidReason:null});expect(f.wallet).toEqual({status:'ACTIVE',remainingSessions:1});
  expect(record).toMatchObject({originalStatus:status,originalReason:'原原因',originalOperatorStaffId:'staff',originalOperatorName:'原操作者',remainingAfter:1});expect(record.originalDate).toBe(status==='BACKFILLED'?'2026-11-09T00:00:00.000Z':'2026-11-11T01:00:00.000Z');
  expect(f.m.auditLog.create.mock.calls[0][0].data).toMatchObject({action:'WALLET_SESSION_CORRECTION',beforeJson:{status,voidReason:'原原因'}});
  // A replay after the slot is used again must never return a second quota unit.
  f.setStatus('BACKFILLED');expect(await correctWalletSession(f.tx,actor,d)).toEqual(record);expect(f.m.walletSession.updateMany).toHaveBeenCalledOnce();expect(f.m.auditLog.create).toHaveBeenCalledOnce();
});
it.each(['AVAILABLE','RESERVED','COMPLETED'])('rejects %s without changing the ledger',async status=>{const f=fixture(status);await expect(correctWalletSession(f.tx,actor,input)).rejects.toThrow('僅能更正');expect(f.m.walletSession.updateMany).not.toHaveBeenCalled();});
it('rejects a booking-bound row even if its status appears manually adjusted',async()=>{const f=fixture();f.bind();await expect(correctWalletSession(f.tx,actor,input)).rejects.toThrow('僅能更正');expect(f.m.walletSession.updateMany).not.toHaveBeenCalled();});
it('rejects a stale generation, preventing correction of a later reuse of the same slot',async()=>{const f=fixture();await expect(correctWalletSession(f.tx,actor,{...input,expectedUpdatedAt:'2026-11-10T02:00:00.000Z'})).rejects.toThrow('已更新');expect(f.m.walletSession.updateMany).not.toHaveBeenCalled();});
it('rejects status changes and a lost compare-and-swap race',async()=>{const f=fixture('VOIDED');await expect(correctWalletSession(f.tx,actor,input)).rejects.toThrow('已更新');f.setStatus('BACKFILLED');f.m.walletSession.updateMany.mockResolvedValueOnce({count:0});await expect(correctWalletSession(f.tx,actor,input)).rejects.toThrow('已更新');expect(f.m.auditLog.create).not.toHaveBeenCalled();});
it('rejects a closed plan and does not extend an expired plan',async()=>{const f=fixture();f.wallet.status='CANCELLED';await expect(correctWalletSession(f.tx,actor,input)).rejects.toThrow('整份方案已註銷');expect(f.m.walletSession.updateMany).not.toHaveBeenCalled();f.wallet.status='EXPIRED';await correctWalletSession(f.tx,actor,input);expect(f.wallet.status).toBe('EXPIRED');});
it('binds both ownership and command receipts to the original request',async()=>{const f=fixture();await expect(correctWalletSession(f.tx,{...actor,storeId:'other'},input)).rejects.toThrow('門市已切換');await correctWalletSession(f.tx,actor,input);await expect(correctWalletSession(f.tx,actor,{...input,reason:'different'})).rejects.toThrow('其他更正');await expect(correctWalletSession(f.tx,actor,{...input,requestKey:'00000000-0000-4000-8000-000000000002'})).rejects.toThrow('僅能更正');expect(f.m.walletSession.updateMany).toHaveBeenCalledOnce();});
it('scopes wallet ownership to the exact customer and store',async()=>{const f=fixture();f.m.customerPlanWallet.findFirst.mockResolvedValueOnce(null as never);await expect(correctWalletSession(f.tx,actor,input)).rejects.toThrow('本店顧客');expect(f.m.customerPlanWallet.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'wallet',storeId:'store',customerId:'customer'}}));expect(f.m.walletSession.updateMany).not.toHaveBeenCalled();});
it('requires a reason and stable session generation, rather than accepting arbitrary completed statuses',()=>{expect(walletSessionCorrectionInput.safeParse({...input,reason:'   '}).success).toBe(false);expect(walletSessionCorrectionInput.safeParse({...input,expectedStatus:'COMPLETED'}).success).toBe(false);expect(walletSessionCorrectionInput.safeParse({...input,expectedUpdatedAt:'invalid'}).success).toBe(false);});
