import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({receipts:vi.fn(),cash:vi.fn(),orders:vi.fn(),customers:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{serviceAddOnReceipt:{findMany:m.receipts},cashbookEntry:{findMany:m.cash},serviceAddOnOrder:{findMany:m.orders},customer:{findMany:m.customers}}}));
import {readLegacyAddOnAuditEvidence} from '@/server/services/add-on-audit-reader';
import {auditListDescription} from '@/lib/audit-presentation';
const row={id:'audit',storeId:'own',targetType:'ServiceAddOnOrder',targetId:'group:party',actorUserId:'actor',action:'SHARED_GOODS_REFUND',afterJson:{id:'receipt',amount:-80}};
const receipt={id:'receipt',storeId:'own',orderId:'order',amount:-80,method:'CASH',actorId:'actor'};
const cash={id:'addon:receipt',storeId:'own',amount:80,type:'EXPENSE',customerId:'customer',createdByUserId:'actor',note:'退回 CASH｜當時教材 × 2'};
const order={id:'order',storeId:'own',ownership:'RESERVATION',reservationKey:'group:party',participantId:null};
beforeEach(()=>{vi.clearAllMocks();m.receipts.mockResolvedValue([receipt]);m.cash.mockResolvedValue([cash]);m.orders.mockResolvedValue([order]);m.customers.mockResolvedValue([{id:'customer',storeId:'own',name:'王小明'}]);});
it('uses the original cash note, clearly marks current names, and never selects mutable cart contents',async()=>{
 const references=(await readLegacyAddOnAuditEvidence([row])).get('audit');
 expect(references).toEqual({'receipt:items':'當時教材 × 2','receipt:customerName':'王小明（目前姓名）'});
 expect(auditListDescription(row,undefined,references)).toBe('王小明（目前姓名）的商品單退款 NT$ 80｜當時教材 × 2');
 expect(m.receipts).toHaveBeenCalledWith(expect.objectContaining({where:{OR:[{id:'receipt',storeId:'own'}]}}));
 expect(m.orders.mock.calls[0][0].select).not.toHaveProperty('items');
 expect(m.customers).toHaveBeenCalledWith({where:{OR:[{id:'customer',storeId:'own'}]},select:{id:true,storeId:true,name:true}});
 expect(row.afterJson).toEqual({id:'receipt',amount:-80});
});
it.each([
 ['foreign receipt',()=>m.receipts.mockResolvedValue([{...receipt,storeId:'foreign'}])],
 ['wrong amount',()=>m.receipts.mockResolvedValue([{...receipt,amount:-81}])],
 ['wrong direction',()=>m.receipts.mockResolvedValue([{...receipt,amount:80}])],
 ['wrong actor',()=>m.receipts.mockResolvedValue([{...receipt,actorId:'other'}])],
 ['foreign order',()=>m.orders.mockResolvedValue([{...order,storeId:'foreign'}])],
 ['other reservation',()=>m.orders.mockResolvedValue([{...order,reservationKey:'group:other'}])],
 ['wrong ownership',()=>m.orders.mockResolvedValue([{...order,ownership:'PERSON'}])],
 ['foreign cash',()=>m.cash.mockResolvedValue([{...cash,storeId:'foreign'}])],
 ['wrong cash amount',()=>m.cash.mockResolvedValue([{...cash,amount:81}])],
 ['wrong cash type',()=>m.cash.mockResolvedValue([{...cash,type:'INCOME'}])],
 ['wrong cash actor',()=>m.cash.mockResolvedValue([{...cash,createdByUserId:'other'}])],
 ['unexpected note',()=>m.cash.mockResolvedValue([{...cash,note:'manually edited'}])],
] as const)('does not supplement mismatched evidence: %s',async(_label,setup)=>{setup();expect((await readLegacyAddOnAuditEvidence([row])).size).toBe(0);expect(m.customers).not.toHaveBeenCalled();});
it('does not use a foreign customer returned by a mock and still retains saved item evidence',async()=>{
 m.customers.mockResolvedValue([{id:'customer',storeId:'foreign',name:'private'}]);
 const references=(await readLegacyAddOnAuditEvidence([row])).get('audit');
 expect(references).toEqual({'receipt:items':'當時教材 × 2'});
});
it('uses the participant scope for personal add-ons',async()=>{
 m.orders.mockResolvedValue([{...order,ownership:'PERSON',reservationKey:null,participantId:'person'}]);
 expect((await readLegacyAddOnAuditEvidence([{...row,targetId:'person',action:'ADD_ON_REFUND'}])).get('audit')).toHaveProperty('receipt:items');
});
it('does not override a saved name or saved cart snapshot with later evidence',async()=>{
 const saved={...row,afterJson:{...row.afterJson,customerName:'當時姓名'}};
 const references=(await readLegacyAddOnAuditEvidence([saved])).get('audit');
 expect(references).not.toHaveProperty('receipt:customerName');
 expect(auditListDescription(saved,undefined,references)).toContain('當時姓名的商品單');
 const complete={...saved,afterJson:{...saved.afterJson,items:[]}};
 m.receipts.mockClear();expect((await readLegacyAddOnAuditEvidence([complete])).size).toBe(0);expect(m.receipts).not.toHaveBeenCalled();
});
it('does no reads for absent scope, malformed receipts, or unrelated events',async()=>{
 await readLegacyAddOnAuditEvidence([{...row,storeId:null},{...row,afterJson:{id:'receipt',amount:'-80'}},{...row,targetType:'Customer'}]);
 expect(m.receipts).not.toHaveBeenCalled();
});
it('batches a page without one database query per audit record',async()=>{
 await readLegacyAddOnAuditEvidence(Array.from({length:50},(_,i)=>({...row,id:`audit${i}`})));
 for(const fn of Object.values(m))expect(fn).toHaveBeenCalledTimes(1);
});
