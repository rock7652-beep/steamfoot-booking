import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({command:vi.fn(),issue:vi.fn(),resolve:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/server/beauty/access',()=>({command:m.command}));
vi.mock('@/server/beauty/commerce',()=>({issueCard:m.issue}));
vi.mock('@/server/services/digital-manager-notices',()=>({resolveDigitalManagerNotice:m.resolve}));
import {confirmOnlineBeautyOrder} from '@/server/beauty/online-confirm';
import type {Tx} from '@/server/beauty/booking';
const actor={storeId:'store',userId:'staff'};
const order={id:'order',customerId:'customer',planId:'plan',status:'PENDING',cardId:null,snapshot:{id:'plan',name:'方案原快照',sessions:10,price:5000,validDays:30,serviceIds:['service'],active:true}};
const find=vi.fn(),update=vi.fn(),revision=vi.fn(),payment=vi.fn(),create=vi.fn();
const tx={beautyPurchase:{findFirst:find,update},beautyTransactionRevision:{findFirst:revision,create},beautyPayment:{findFirstOrThrow:payment}} as unknown as Tx;
beforeEach(()=>{vi.clearAllMocks();m.command.mockImplementation((_tx:unknown,_a:unknown,_key:unknown,_d:unknown,work:()=>unknown)=>work());find.mockResolvedValue(order);revision.mockResolvedValue(null);m.issue.mockResolvedValue({cardId:'card'});});
describe('online confirmation accounting',()=>{
 it('uses the submitted snapshot and writes the original order in the same transaction',async()=>{
  expect(await confirmOnlineBeautyOrder(tx,actor,{id:'order',requestKey:'key'})).toEqual({cardId:'card'});
  expect(m.issue).toHaveBeenCalledWith(tx,actor,expect.objectContaining({planId:'plan',customerId:'customer',paid:5000,method:'BANK_TRANSFER'}),expect.objectContaining({name:'方案原快照',price:5000}));
  expect(update).toHaveBeenCalledWith({where:{id:'order'},data:{cardId:'card',status:'CONFIRMED'}});
  expect(m.resolve).toHaveBeenCalledWith(tx,{storeId:'store',eventKey:'beauty-purchase-pending:order',actorUserId:'staff',actorName:'門市人員'});
 });
 it('does not issue a second card for a previously confirmed legacy order',async()=>{
  find.mockResolvedValue({...order,status:'CONFIRMED',cardId:'existing-card'});
  expect(await confirmOnlineBeautyOrder(tx,actor,{id:'order',requestKey:'another-key'})).toEqual({cardId:'existing-card'});
  expect(m.issue).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
 });
 it('does not report success for a confirmed order whose card is missing',async()=>{
  find.mockResolvedValue({...order,status:'CONFIRMED',cardId:null});
  await expect(confirmOnlineBeautyOrder(tx,actor,{id:'order',requestKey:'key'})).rejects.toThrow('發卡紀錄不完整');
  expect(m.issue).not.toHaveBeenCalled();
 });
 it('does not charge an order that was voided before confirmation',async()=>{
  find.mockResolvedValue({...order,status:'VOIDED'});
  await expect(confirmOnlineBeautyOrder(tx,actor,{id:'order',requestKey:'key'})).rejects.toThrow('訂單狀態已變更');
  expect(m.issue).not.toHaveBeenCalled();
 });
 it('copies a pending transaction correction to the resulting payment',async()=>{
  revision.mockResolvedValue({note:'備註',revenueStaffId:'manager'});payment.mockResolvedValue({id:'sale'});
  await confirmOnlineBeautyOrder(tx,actor,{id:'order',requestKey:'key'});
  expect(create).toHaveBeenCalledWith({data:expect.objectContaining({storeId:'store',transactionId:'sale',note:'備註',revenueStaffId:'manager'})});
 });
});
