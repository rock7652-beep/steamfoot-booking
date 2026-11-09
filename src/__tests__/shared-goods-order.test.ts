import {beforeEach,expect,it,vi} from 'vitest';
import type {Prisma} from '@prisma/client';
vi.mock('@/server/services/cash-day',()=>({lockCashDay:vi.fn()}));
import {readAddOnOrder,saveAddOnOrder,postAddOnReceipt,addOnCommand} from '@/server/services/service-add-ons';
const a={storeId:'s',module:'STEAMFOOT' as const,userId:'u',staffId:'staff'},p={id:'person-a',bookingId:'booking',reservationKey:'booking',ownership:'RESERVATION' as const,customerId:'c',status:'ACTIVE',bookingStatus:'ACTIVE'};
const groups=[{id:'g',kind:'SHARED_GOODS',title:'飲品',multiple:true,required:false,options:[{id:'tea',name:'茶',price:80,duration:0,active:true},{id:'free',name:'免費茶',price:0,duration:0,active:true}]}];
const items=[{id:'tea',name:'茶',price:80,duration:0,groupId:'g',groupTitle:'飲品',quantity:2,ownership:'RESERVATION'}];
let tx:Prisma.TransactionClient;
beforeEach(()=>{tx={serviceAddOnCatalog:{findUnique:vi.fn().mockResolvedValue({revision:1,groups})},serviceAddOnOrder:{findUnique:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({id:'o',revision:1}),update:vi.fn().mockResolvedValue({id:'o',revision:2})},serviceAddOnReceipt:{findMany:vi.fn().mockResolvedValue([]),create:vi.fn().mockResolvedValue({id:'receipt',amount:160})},customer:{findFirst:vi.fn().mockResolvedValue({assignedStaffId:'staff'})},staff:{findFirst:vi.fn().mockResolvedValue({id:'staff'})},cashbookEntry:{create:vi.fn(),findFirst:vi.fn().mockResolvedValue({staffId:'staff'})},serviceAddOnCommand:{findUnique:vi.fn().mockResolvedValue(null),create:vi.fn()}} as unknown as Prisma.TransactionClient;});
it('creates one reservation-owned order with a real parent key and no participant association',async()=>{
 await saveAddOnOrder(tx,a,p,{revision:0,catalogRevision:1,ids:[],selections:[{id:'tea',quantity:2},{id:'free',quantity:3}]});
 expect(tx.serviceAddOnOrder.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({participantId:null,ownership:'RESERVATION',reservationKey:'booking',bookingId:'booking',total:160})}));
 const where=vi.mocked(tx.serviceAddOnOrder.findUnique).mock.calls[0][0]!.where;
 expect(where).toEqual({storeId_module_bookingId_reservationKey:{storeId:'s',module:'STEAMFOOT',bookingId:'booking',reservationKey:'booking'}});
});
it('a different participant reads the same cart, with no people-count multiplication',async()=>{
 await readAddOnOrder(tx,a,p);await readAddOnOrder(tx,a,{...p,id:'person-b'});
 expect(vi.mocked(tx.serviceAddOnOrder.findUnique).mock.calls[0][0]).toEqual(vi.mocked(tx.serviceAddOnOrder.findUnique).mock.calls[1][0]);
});
it('collects once into the cashbook and requires refund before decreasing paid quantities',async()=>{
 vi.mocked(tx.serviceAddOnOrder.findUnique).mockResolvedValue({id:'o',ownership:'RESERVATION',revision:1,total:160,items,cancelled:false} as never);
 await postAddOnReceipt(tx,a,p,{revision:1,amount:160,method:'OTHER'});
 expect(tx.cashbookEntry.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({data:expect.objectContaining({amount:160,note:expect.stringContaining('茶 × 2')})}));
 vi.mocked(tx.serviceAddOnReceipt.findMany).mockResolvedValue([{id:'sale',amount:160,method:'OTHER',createdAt:new Date(),originalId:null}] as never);
 await expect(saveAddOnOrder(tx,a,p,{revision:1,catalogRevision:1,ids:[],selections:[{id:'tea',quantity:1}]})).rejects.toThrow('先退回差額');
});
it('allows refund after the whole party cancels but forbids new sales',async()=>{
 vi.mocked(tx.serviceAddOnOrder.findUnique).mockResolvedValue({id:'o',ownership:'RESERVATION',revision:1,total:160,items,cancelled:false} as never);
 vi.mocked(tx.serviceAddOnReceipt.findMany).mockResolvedValue([{id:'sale',amount:160,method:'OTHER',createdAt:new Date(),originalId:null}] as never);
 const cancelled={...p,status:'CANCELLED'};
 await expect(postAddOnReceipt(tx,a,cancelled,{revision:1,amount:80,method:'OTHER',originalId:'sale'})).resolves.toBeTruthy();
 await expect(postAddOnReceipt(tx,a,cancelled,{revision:1,amount:1,method:'OTHER'})).rejects.toThrow('不能收取');
});
it('preserves sold unit prices after catalog price changes',async()=>{
 vi.mocked(tx.serviceAddOnOrder.findUnique).mockResolvedValue({id:'o',ownership:'RESERVATION',revision:1,total:160,items,cancelled:false} as never);
 vi.mocked(tx.serviceAddOnCatalog.findUnique).mockResolvedValue({revision:1,groups:[{...groups[0],options:[{...groups[0].options[0],price:999}]}]} as never);
 await saveAddOnOrder(tx,a,p,{revision:1,catalogRevision:1,ids:[],selections:[{id:'tea',quantity:3}]});
 expect(tx.serviceAddOnOrder.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({total:240})}));
});
it('does not replay a personal command result as a shared order and does not double-write on retry',async()=>{
 const work=vi.fn().mockResolvedValue({id:'o'});await addOnCommand(tx,a,'key',{ownership:'RESERVATION',quantity:2},work);
 const recorded=vi.mocked(tx.serviceAddOnCommand.create).mock.calls[0][0]!.data;
 vi.mocked(tx.serviceAddOnCommand.findUnique).mockResolvedValue(recorded as never);
 await addOnCommand(tx,a,'key',{ownership:'RESERVATION',quantity:2},work);expect(work).toHaveBeenCalledOnce();
 await expect(addOnCommand(tx,a,'key',{ownership:'PERSON',quantity:1},work)).rejects.toThrow('重新核對');
});

it('does not sell additional retired units while retaining the existing order snapshot',async()=>{
 vi.mocked(tx.serviceAddOnOrder.findUnique).mockResolvedValue({id:'o',ownership:'RESERVATION',revision:1,total:160,items,cancelled:false} as never);
 vi.mocked(tx.serviceAddOnCatalog.findUnique).mockResolvedValue({revision:1,groups:[]} as never);
 await expect(saveAddOnOrder(tx,a,p,{revision:1,catalogRevision:1,ids:[],selections:[{id:'tea',quantity:3}]})).rejects.toThrow('只能保留或減少');
 await expect(saveAddOnOrder(tx,a,p,{revision:1,catalogRevision:1,ids:[],selections:[{id:'tea',quantity:2}]})).resolves.toBeTruthy();
});
