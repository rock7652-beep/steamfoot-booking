import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({command:vi.fn(),audit:vi.fn(),cash:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({command:m.command,audit:m.audit}));
vi.mock('@/server/services/cash-day',()=>({lockCashDay:m.cash}));
import type {Tx} from '@/server/beauty/booking';
import {correctBeautyTransaction} from '@/server/beauty/transaction-correction';
afterEach(()=>vi.unstubAllEnvs());
const a={storeId:'s',userId:'owner',manager:true};
const base={purchaseId:'sale',expectedRevision:0,reason:'誤建',requestKey:'stable',operation:'void' as const};
const sale={id:'sale',storeId:'s',revision:0,kind:'SALE',cardId:'card',appointmentId:null,amount:1000,method:'OTHER',note:'原單',revenueStaffId:null,voidedAt:null};
function makeTx(){return {beautyEvent:{findMany:vi.fn().mockResolvedValue([])},beautyTransactionRevision:{findFirst:vi.fn().mockResolvedValue(null),create:vi.fn()},beautyPayment:{findFirst:vi.fn().mockResolvedValue({...sale}),count:vi.fn().mockResolvedValue(0),update:vi.fn()},beautyPurchase:{findFirst:vi.fn().mockResolvedValue(null),update:vi.fn(),updateMany:vi.fn()},beautyCard:{findFirst:vi.fn().mockResolvedValue({id:'card',customerId:'customer',remaining:8,sessions:8,paid:1000,closedAt:null}),update:vi.fn()},beautyLedger:{findMany:vi.fn().mockResolvedValue([{kind:'GRANT',delta:8}]),create:vi.fn()},beautyAppointment:{count:vi.fn().mockResolvedValue(0)},$queryRaw:vi.fn().mockResolvedValue([{amount:1000,type:'INCOME',paymentMethod:'OTHER',entryDate:new Date('2026-10-23')}]),$executeRaw:vi.fn()};}
let tx:ReturnType<typeof makeTx>;
beforeEach(()=>{vi.resetAllMocks();m.command.mockImplementation(async(_tx,_a,_key,_intent,work)=>work());tx=makeTx();tx.beautyPayment.count.mockImplementation(async({where}: {where:{kind?:string}})=>where.kind==='SALE'?1:0);});
it('reverses only an unused unique card, preserves receipt and records original-date cash reversal',async()=>{await correctBeautyTransaction(tx as unknown as Tx,a,base);expect(tx.beautyCard.update).toHaveBeenCalledWith({where:{id:'card'},data:{remaining:0,closedAt:expect.any(Date)}});expect(tx.beautyLedger.create).toHaveBeenCalledWith({data:{storeId:'s',cardId:'card',kind:'VOID',delta:-8,actorUserId:'owner'}});expect(tx.beautyPayment.update).not.toHaveBeenCalled();expect(tx.beautyTransactionRevision.create).toHaveBeenCalledWith({data:expect.objectContaining({transactionId:"sale",revision:1,voidedAt:expect.any(Date),voidReason:"誤建"})});expect(tx.$executeRaw.mock.calls[0][0].join('?')).toContain('SELECT');expect(tx.$executeRaw.mock.calls[0].slice(1)).toContain('beauty-void:sale');expect(m.audit).toHaveBeenCalled();});
it.each(['foreign','stale','refunded','used','booked','multiple','cash-mismatch','closed-cash','service'])('blocks %s before balance or ledger changes',async scenario=>{if(scenario==='foreign'){tx.beautyPayment.findFirst.mockResolvedValue(null);}if(scenario==='stale')tx.beautyTransactionRevision.findFirst.mockResolvedValue({revision:1});if(scenario==='refunded')tx.beautyPayment.count.mockResolvedValue(1);if(scenario==='used')tx.beautyCard.findFirst.mockResolvedValue({remaining:7,sessions:8,paid:1000});if(scenario==='booked')tx.beautyAppointment.count.mockResolvedValue(1);if(scenario==='multiple')tx.beautyPayment.count.mockImplementation(async({where}:{where:{kind?:string}})=>where.kind?2:0);if(scenario==='cash-mismatch')tx.$queryRaw.mockResolvedValue([{amount:999,type:'INCOME',paymentMethod:'OTHER'}]);if(scenario==='closed-cash'){tx.beautyPayment.findFirst.mockResolvedValue({...sale,method:'CASH'});tx.$queryRaw.mockResolvedValue([{amount:1000,type:'INCOME',paymentMethod:'CASH'}]);m.cash.mockRejectedValue(Error('closed'));}if(scenario==='service')tx.beautyPayment.findFirst.mockResolvedValue({...sale,appointmentId:'booking',cardId:null});await expect(correctBeautyTransaction(tx as unknown as Tx,a,base)).rejects.toThrow();expect(tx.beautyCard.update).not.toHaveBeenCalled();expect(tx.beautyLedger.create).not.toHaveBeenCalled();expect(tx.beautyPayment.update).not.toHaveBeenCalled();});
it('supports zero paid card without inventing a cash or customer refund',async()=>{tx.beautyPayment.findFirst.mockResolvedValue({...sale,amount:0});tx.beautyCard.findFirst.mockResolvedValue({id:'card',customerId:'customer',remaining:8,sessions:8,paid:0});await correctBeautyTransaction(tx as unknown as Tx,a,base);expect(tx.$executeRaw).not.toHaveBeenCalled();expect(tx.beautyCard.update).toHaveBeenCalled();});
it('edits only metadata, requires active same-store staff and keeps original price/method',async()=>{tx.$queryRaw.mockResolvedValue([{id:'manager'}]);await correctBeautyTransaction(tx as unknown as Tx,a,{...base,operation:'edit',note:'說明',revenueStaffId:'manager'});expect(tx.beautyTransactionRevision.create.mock.calls[0][0].data).toMatchObject({note:'說明',revenueStaffId:'manager',revision:1});expect(tx.beautyPayment.update).not.toHaveBeenCalled();expect(tx.beautyCard.update).not.toHaveBeenCalled();expect(tx.$queryRaw.mock.calls[0].slice(1)).toEqual(['manager','s']);});
it('denies forged staff without metadata or finance mutation',async()=>{tx.$queryRaw.mockResolvedValue([]);await expect(correctBeautyTransaction(tx as unknown as Tx,a,{...base,operation:'edit',note:'x',revenueStaffId:'foreign'})).rejects.toThrow('本店');expect(tx.beautyPayment.update).not.toHaveBeenCalled();expect(tx.$executeRaw).not.toHaveBeenCalled();});
it('voids pending requests and resolves the store notice without issuing cards or touching cash',async()=>{tx.beautyPayment.findFirst.mockResolvedValue(null);tx.beautyPurchase.findFirst.mockResolvedValue({id:'q',revision:0,status:'PENDING',cardId:null});await correctBeautyTransaction(tx as unknown as Tx,a,base);expect(tx.beautyPurchase.update).toHaveBeenCalledWith({where:{id:'q'},data:{status:'VOIDED'}});expect(tx.beautyCard.update).not.toHaveBeenCalled();expect(tx.$executeRaw).toHaveBeenCalledOnce();expect(tx.$executeRaw.mock.calls[0][0].join('')).toContain('"DigitalManagerNotice"');expect(tx.$executeRaw.mock.calls[0].slice(1)).toContain('beauty-purchase-pending:q');});

it('voids a verified unused sale while finishing its committed confirmation in the same operation',async()=>{
 vi.stubEnv('BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED','1');
 let status='COMMITTED';
 tx.$queryRaw.mockImplementation(async(parts:TemplateStringsArray)=>{
  const sql=parts.join('');
  if(sql.includes('UPDATE "BeautyPurchaseIntent"')){status='ACKNOWLEDGED';return [{requestKey:'original',customerId:'customer',status,cardId:'card'}];}
  if(sql.includes('LEFT JOIN'))return status==='COMMITTED'?[{requestKey:'original'}]:[];
  if(sql.includes('"BeautyPurchaseIntent"'))return sql.includes('"cardId"=')&&status==='ACKNOWLEDGED'?[]:[{requestKey:'original',customerId:'customer',status,cardId:'card'}];
  return [{amount:1000,type:'INCOME',paymentMethod:'OTHER',entryDate:new Date('2026-10-23')}];
 });
 await correctBeautyTransaction(tx as unknown as Tx,a,base);
 expect(status).toBe('ACKNOWLEDGED');expect(tx.beautyCard.update).toHaveBeenCalledOnce();expect(tx.beautyLedger.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({kind:'VOID',delta:-8})}));
});
it.each(['PREPARED','foreign-customer'])('does not release an unresolved or mismatched marker: %s',async scenario=>{
 vi.stubEnv('BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED','1');
 tx.$queryRaw.mockResolvedValue([{requestKey:'original',customerId:scenario==='foreign-customer'?'foreign':'customer',status:scenario==='PREPARED'?'PREPARED':'COMMITTED'}]);
 await expect(correctBeautyTransaction(tx as unknown as Tx,a,base)).rejects.toThrow('原購買資料仍待核對');
 expect(tx.beautyCard.update).not.toHaveBeenCalled();expect(tx.beautyLedger.create).not.toHaveBeenCalled();expect(tx.$executeRaw).not.toHaveBeenCalled();
});
it('never acknowledges a completed purchase when its card has been used',async()=>{
 vi.stubEnv('BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED','1');tx.beautyAppointment.count.mockResolvedValue(1);
 await expect(correctBeautyTransaction(tx as unknown as Tx,a,base)).rejects.toThrow('方案已有預約');
 expect(tx.$queryRaw).not.toHaveBeenCalled();expect(tx.beautyCard.update).not.toHaveBeenCalled();
});
