import {beforeEach,it,expect,vi,describe} from 'vitest';
vi.mock('@/server/services/cash-day',()=>({lockCashDay:vi.fn()}));
import {postSteamfootAddOnReceipt,saveSteamfootAddOnOrder,addOnCommand} from '@/server/services/steamfoot-add-ons';
import type {Prisma} from '@prisma/client';
import {lockCashDay} from '@/server/services/cash-day';
describe.each(['STEAMFOOT','FITNESS','MUSIC'] as const)('%s independent add-on ledger',module=>{
const a={storeId:'s',userId:'u',staffId:'staff',module},p={id:'p',bookingId:'b',customerId:'c',status:'PENDING',bookingStatus:'CONFIRMED'};
const items=[{id:'tea',name:'養生茶',price:80,duration:0,active:true,quantity:1,groupId:'g',groupTitle:'加購'}];
let tx:Prisma.TransactionClient;
beforeEach(()=>{vi.clearAllMocks();tx={serviceAddOnCatalog:{findUnique:vi.fn().mockResolvedValue({revision:1,groups:[{id:'g',title:'加購',multiple:true,required:false,options:items}]})},serviceAddOnOrder:{findUnique:vi.fn().mockResolvedValue({id:'o',revision:1,items,total:80,cancelled:false}),create:vi.fn(),update:vi.fn().mockResolvedValue({id:'o',revision:2})},serviceAddOnReceipt:{findMany:vi.fn().mockResolvedValue([]),create:vi.fn().mockImplementation(({data})=>Promise.resolve(data))},customer:{findFirst:vi.fn().mockResolvedValue({assignedStaffId:'staff'})},staff:{findFirst:vi.fn().mockResolvedValue({id:'staff'})},cashbookEntry:{create:vi.fn(),findFirst:vi.fn().mockResolvedValue({staffId:'staff'})},serviceAddOnCommand:{findUnique:vi.fn().mockResolvedValue(null),create:vi.fn()}} as unknown as Prisma.TransactionClient;});
it('records add-on income separately without changing booking time, participant or wallet',async()=>{
 await postSteamfootAddOnReceipt(tx,a,p,{revision:1,amount:80,method:'CASH'});
 expect(lockCashDay).toHaveBeenCalledWith(tx,'s',expect.any(Date),{requireOpen:true});
 expect(tx.cashbookEntry.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({type:'INCOME',amount:80,category:'附加項目',customerId:'c'})}));
 expect(tx.serviceAddOnOrder.update).toHaveBeenCalledWith({where:{id:'o'},data:{revision:{increment:1}}});
});
it('rejects excess payment and stale revision before writing receipts',async()=>{
 await expect(postSteamfootAddOnReceipt(tx,a,p,{revision:1,amount:81,method:'OTHER'})).rejects.toThrow('超過');
 await expect(postSteamfootAddOnReceipt(tx,a,p,{revision:0,amount:80,method:'OTHER'})).rejects.toThrow('更新');
 expect(tx.serviceAddOnReceipt.create).not.toHaveBeenCalled();
});
it('allows refunds after cancellation, never more than the original receipt or collected total',async()=>{
 vi.mocked(tx.serviceAddOnReceipt.findMany).mockResolvedValue([{id:'sale',amount:80,method:'OTHER',originalId:null,createdAt:new Date()}] as never);
 await postSteamfootAddOnReceipt(tx,a,{...p,status:'CANCELLED'},{revision:1,amount:30,method:'OTHER',originalId:'sale'});
 expect(tx.cashbookEntry.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({type:'EXPENSE',amount:30,category:'附加項目退款'})}));
 await expect(postSteamfootAddOnReceipt(tx,a,p,{revision:1,amount:81,method:'OTHER',originalId:'sale'})).rejects.toThrow('可退');
 await expect(postSteamfootAddOnReceipt(tx,a,p,{revision:1,amount:1,method:'OTHER',originalId:'foreign'})).rejects.toThrow('可退');
});
it('requires refund before reducing a paid order',async()=>{
 vi.mocked(tx.serviceAddOnReceipt.findMany).mockResolvedValue([{id:'sale',amount:80,method:'OTHER',originalId:null,createdAt:new Date()}] as never);
 await expect(saveSteamfootAddOnOrder(tx,a,p,{revision:1,catalogRevision:1,ids:[]})).rejects.toThrow('先退回');
});
it('replays the same command without a second write and rejects changed input',async()=>{
 const work=vi.fn().mockResolvedValue({id:'o'});
 await addOnCommand(tx,a,'key',{amount:80},work);
 const record=vi.mocked(tx.serviceAddOnCommand.create).mock.calls[0][0].data;
 vi.mocked(tx.serviceAddOnCommand.findUnique).mockResolvedValue(record as never);
 expect(await addOnCommand(tx,a,'key',{amount:80},work)).toEqual({id:'o'});expect(work).toHaveBeenCalledTimes(1);
 await expect(addOnCommand(tx,a,'key',{amount:81},work)).rejects.toThrow('請求已使用');
 await expect(addOnCommand(tx,{...a,module:module==='MUSIC'?'FITNESS':'MUSIC'},'key',{amount:80},work)).rejects.toThrow('請求已使用');
});

});
