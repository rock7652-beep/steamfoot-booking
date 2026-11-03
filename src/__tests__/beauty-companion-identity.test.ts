import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/db',()=>({prisma:{}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{}}));
const calls=vi.hoisted(()=>({owns:vi.fn(),overlap:vi.fn(),audit:vi.fn()}));
vi.mock('@/server/beauty/booking',()=>({ownsItem:calls.owns,assertCustomerAvailable:calls.overlap}));
vi.mock('@/server/beauty/access',()=>({audit:calls.audit}));
import {linkCompanion} from '@/server/beauty/companions';
import type {Tx} from '@/server/beauty/booking';
import {partyInput} from '@/lib/beauty/contracts';
const a={storeId:'beauty',userId:'manager',manager:true};
const original={id:'item',storeId:'beauty',groupId:'group',group:{customerId:'sponsor',phone:'0900000001'},revision:3,customerId:null,cardId:'card',status:'COMPLETED',startsAt:new Date('2099-10-24T01:00Z'),occupiedEndsAt:new Date('2099-10-24T02:15Z'),technicianId:'tech2',locationId:'bed2',fee:300,debit:true};
let tx:Tx;
beforeEach(()=>{vi.clearAllMocks();calls.owns.mockResolvedValue({...original});calls.overlap.mockResolvedValue(undefined);tx={beautyAppointment:{count:vi.fn().mockResolvedValue(0),update:vi.fn()},beautyGroup:{update:vi.fn()},beautyCard:{findFirst:vi.fn().mockResolvedValue({allowShared:true,memberIds:['sponsor']}),update:vi.fn()},beautyLedger:{create:vi.fn()},beautyPayment:{create:vi.fn()},$queryRaw:vi.fn().mockResolvedValue([{id:'friend',name:'親友',phone:'0900000002'}])} as unknown as Tx;});
it('links into the original completed reservation and preserves resources, charging snapshots, card quota and ledger',async()=>{
 await expect(linkCompanion(tx,a,{id:'item',revision:3,customerId:'friend'})).resolves.toEqual({id:'item',customerId:'friend',name:'親友'});
 expect(tx.beautyAppointment.update).toHaveBeenCalledWith({where:{id:'item'},data:{customerId:'friend',personName:'親友',personPhone:'0900000002',revision:{increment:1}}});expect(tx.beautyCard.update).not.toHaveBeenCalled();expect(tx.beautyLedger.create).not.toHaveBeenCalled();expect(tx.beautyPayment.create).not.toHaveBeenCalled();expect(tx.beautyGroup.update).not.toHaveBeenCalled();
});
it('rejects linking one customer into two people even across different services or completed items',async()=>{
 vi.mocked(tx.beautyAppointment.count).mockResolvedValue(1);await expect(linkCompanion(tx,a,{id:'item',revision:3,customerId:'friend'})).rejects.toThrow('不可重複');expect(tx.beautyAppointment.count).toHaveBeenCalledWith({where:{storeId:'beauty',groupId:'group',customerId:'friend',id:{not:'item'}}});expect(tx.beautyAppointment.update).not.toHaveBeenCalled();
});
it('rejects stale revisions, foreign customers, overlapping customers and unauthorized shared cards before any write',async()=>{
 calls.owns.mockResolvedValueOnce({...original,revision:4});await expect(linkCompanion(tx,a,{id:'item',revision:3,customerId:'friend'})).rejects.toThrow('已更新');
 vi.mocked(tx.$queryRaw).mockResolvedValueOnce([]);await expect(linkCompanion(tx,a,{id:'item',revision:3,customerId:'foreign'})).rejects.toThrow('不屬於本店');
 calls.overlap.mockRejectedValueOnce(Error('已有重疊'));await expect(linkCompanion(tx,a,{id:'item',revision:3,customerId:'friend'})).rejects.toThrow('已有重疊');
 vi.mocked(tx.beautyCard.findFirst).mockResolvedValueOnce({allowShared:false,memberIds:['sponsor']} as never);await expect(linkCompanion(tx,a,{id:'item',revision:3,customerId:'friend'})).rejects.toThrow('未開放共用');expect(tx.beautyAppointment.update).not.toHaveBeenCalled();
});
it('accepts known primary plus unnamed companions, rejects unnamed primary and repeated customer IDs',()=>{
 const p={customerId:'owner',name:'顧客',phone:'0900000001',preference:'ANY',serviceId:'service'};
 const d={requestKey:crypto.randomUUID(),date:'2099-10-24',time:'09:00',contactName:'顧客',phone:'0900000001',isTrial:false,people:[p,{name:'同行者 1',phone:'',pendingIdentity:true,preference:'ANY',serviceId:'other',isTrial:true}]};
 expect(partyInput.safeParse(d).success).toBe(true);expect(partyInput.safeParse({...d,people:[d.people[1]]}).success).toBe(false);expect(partyInput.safeParse({...d,people:[p,{...p,serviceId:'other'}]}).success).toBe(false);expect(partyInput.safeParse({...d,expectedArrangement:[{technicianId:'t',locationId:'r'}]}).success).toBe(false);
});
