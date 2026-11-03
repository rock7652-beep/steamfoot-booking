import {beforeEach,expect,it,vi} from 'vitest';
import type {Prisma} from '@prisma/client';
import {courseSubjectAddOnGroups,moduleAddOnGroups} from '@/lib/add-ons';
vi.mock('@/server/services/cash-day',()=>({lockCashDay:vi.fn()}));
import {readAddOnOrder,saveAddOnOrder} from '@/server/services/service-add-ons';
const groups=[{id:'ga',title:'教材',subjectIds:['A'],required:false,multiple:true,options:[{id:'book',name:'教材',price:80,duration:0,active:true}]},{id:'gb',title:'飲品',subjectIds:['B'],required:false,multiple:true,options:[{id:'tea',name:'茶',price:50,duration:0,active:true}]},{id:'legacy',title:'未指定',required:false,multiple:true,options:[{id:'old',name:'舊品項',price:20,duration:0,active:true}]}];
const saved={id:'book',name:'原教材',price:60,duration:0,groupId:'ga',groupTitle:'原教材群組',quantity:1};
let tx:Prisma.TransactionClient;
beforeEach(()=>{tx={serviceAddOnCatalog:{findUnique:vi.fn().mockResolvedValue({revision:3,groups})},serviceAddOnOrder:{findUnique:vi.fn().mockResolvedValue(null),update:vi.fn().mockResolvedValue({id:'o',revision:2})},serviceAddOnReceipt:{findMany:vi.fn().mockResolvedValue([])}} as unknown as Prisma.TransactionClient;});
it.each(['FITNESS','MUSIC'] as const)('%s only exposes groups assigned to its teaching item, never all groups by default',module=>{
 expect(courseSubjectAddOnGroups(module,groups,'A').map(g=>g.id)).toEqual(['ga']);
 expect(courseSubjectAddOnGroups(module,groups,'B').map(g=>g.id)).toEqual(['gb']);
 expect(courseSubjectAddOnGroups(module,groups,null)).toEqual([]);
 expect(courseSubjectAddOnGroups(module,groups,'foreign')).toEqual([]);
 expect(()=>moduleAddOnGroups(module,[{...groups[0],subjectIds:['A','A']}])).toThrow('教學項目不可重複');
});
it('cannot choose another teaching item through forged selected IDs',async()=>{
 await expect(saveAddOnOrder(tx,{storeId:'s',module:'FITNESS',userId:'u',staffId:'staff'},{id:'p',bookingId:'A1',customerId:'c',status:'BOOKED',bookingStatus:'ACTIVE',serviceId:'A'},{revision:0,catalogRevision:3,ids:['tea']})).rejects.toThrow('不適用');
 expect(tx.serviceAddOnOrder.update).not.toHaveBeenCalled();
});
it('retains old selections and prices after remapping and repricing without writing on read',async()=>{
 vi.mocked(tx.serviceAddOnCatalog.findUnique).mockResolvedValue({revision:3,groups:[{...groups[0],subjectIds:['B'],options:[{...groups[0].options[0],price:999}]}]} as never);
 vi.mocked(tx.serviceAddOnOrder.findUnique).mockResolvedValue({id:'o',revision:1,total:60,items:[saved],cancelled:false} as never);
 const actor={storeId:'s',module:'MUSIC' as const,userId:'u',staffId:'staff'},person={id:'p',bookingId:'A1',customerId:'c',status:'BOOKED',bookingStatus:'ACTIVE',serviceId:'A'};
 const read=await readAddOnOrder(tx,actor,person);
 expect(read.order?.items[0]).toMatchObject({price:60,name:'原教材'});
 expect(read.groups[0].options[0]).toMatchObject({price:60,name:'原教材'});
 expect(tx.serviceAddOnOrder.update).not.toHaveBeenCalled();
 await saveAddOnOrder(tx,actor,person,{revision:1,catalogRevision:3,ids:['book']});
 expect(tx.serviceAddOnOrder.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({total:60})}));
});
it('rejects a stale catalog revision after a mapping edit',async()=>{
 await expect(saveAddOnOrder(tx,{storeId:'s',module:'FITNESS',userId:'u',staffId:null},{id:'p',bookingId:'A1',customerId:'c',status:'BOOKED',bookingStatus:'ACTIVE',serviceId:'A'},{revision:0,catalogRevision:2,ids:['book']})).rejects.toThrow('已更新');
});
