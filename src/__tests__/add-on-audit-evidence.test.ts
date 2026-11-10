import {expect,it,vi} from 'vitest';
import type {Prisma} from '@prisma/client';
import {addOnAuditEvidence} from '@/server/services/service-add-ons';
import {auditListDescription} from '@/lib/audit-presentation';
const actor={storeId:'own',userId:'actor',staffId:'staff',module:'FITNESS' as const};
const subject={id:'person',bookingId:'booking',reservationKey:'group:party',ownership:'RESERVATION' as const,customerId:'customer',status:'ACTIVE',bookingStatus:'ACTIVE'};
it('captures the authorized order and customer in the same transaction without changing receipt allocation',async()=>{
 const customer=vi.fn().mockResolvedValue({name:'王小明'}),order=vi.fn().mockResolvedValue({items:[{id:'tea',name:'飲品',quantity:2,price:50}]});
 const tx={customer:{findFirst:customer},serviceAddOnOrder:{findUnique:order}} as unknown as Prisma.TransactionClient;
 const evidence=await addOnAuditEvidence(tx,actor,subject,{id:'receipt',amount:-80},'CASH');
 expect(customer).toHaveBeenCalledWith({where:{id:'customer',storeId:'own'},select:{name:true}});
 expect(order).toHaveBeenCalledWith({where:{storeId_module_bookingId_reservationKey:{storeId:'own',module:'FITNESS',bookingId:'booking',reservationKey:'group:party'}},select:{items:true}});
 expect(evidence).toMatchObject({id:'receipt',amount:-80,paymentMethod:'CASH',customerName:'王小明'});
 expect(auditListDescription({action:'SHARED_GOODS_REFUND',targetType:'ServiceAddOnOrder',afterJson:evidence})).toBe('王小明的商品單退款 NT$ 80｜飲品 ×2');
});
it('uses save-result snapshots and does not query current items to reconstruct the past',async()=>{
 const order=vi.fn(),customer=vi.fn().mockResolvedValue({name:'王小明'});
 const tx={customer:{findFirst:customer},serviceAddOnOrder:{findUnique:order}} as unknown as Prisma.TransactionClient;
 const result={id:'order',revision:2,before:[{id:'tea',name:'飲品',quantity:1,price:50}],after:[{id:'tea',name:'飲品',quantity:2,price:50}]};
 const evidence=await addOnAuditEvidence(tx,actor,subject,result);
 expect(order).not.toHaveBeenCalled();expect(evidence.items).toEqual(result.after);
 expect(auditListDescription({action:'SHARED_GOODS_SAVE',targetType:'ServiceAddOnOrder',afterJson:evidence})).toBe('修改王小明的商品單：飲品數量：1 → 2');
});
it('does not substitute the operator or a foreign customer for an unidentified reservation owner',async()=>{
 const customer=vi.fn(),order=vi.fn().mockResolvedValue({items:[]});
 const tx={customer:{findFirst:customer},serviceAddOnOrder:{findUnique:order}} as unknown as Prisma.TransactionClient;
 const evidence=await addOnAuditEvidence(tx,actor,{...subject,customerId:null},{id:'receipt',amount:80});
 expect(customer).not.toHaveBeenCalled();expect(evidence.customerName).toBeNull();
 expect(auditListDescription({action:'SHARED_GOODS_COLLECT',targetType:'ServiceAddOnOrder',afterJson:evidence})).toBe('商品單收款 NT$ 80');
});
