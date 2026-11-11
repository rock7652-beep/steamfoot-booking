import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({readTx:vi.fn(),progress:vi.fn(),member:vi.fn(),worker:vi.fn(),feature:vi.fn(),card:vi.fn(),ledger:vi.fn(),settlement:vi.fn(),payment:vi.fn(),appointments:vi.fn(),portal:vi.fn()}));
vi.mock('@/server/beauty/plan-progress',()=>({beautyPlanProgress:m.progress}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$transaction:m.readTx,beautyCard:{findFirst:m.card},beautyLedger:{findMany:m.ledger},beautySettlement:{findMany:m.settlement},beautyPayment:{findMany:m.payment},beautyAppointment:{findMany:m.appointments}}}));
vi.mock('@/server/beauty/access',()=>({beautyMember:m.member,beautyWorker:m.worker}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/server/beauty/booking',()=>({publicReceipt:(b:Record<string,unknown>)=>({id:b.id,startsAt:b.startsAt,endsAt:b.endsAt,status:b.status})}));
import {readBeautyCardProgress,readBeautyCardHistory,readBeautyOwnIncome,readBeautyWorkRecords} from '@/server/actions/beauty-portal';
beforeEach(()=>{vi.clearAllMocks();m.member.mockResolvedValue({storeId:'store',customerId:'member'});m.worker.mockResolvedValue({storeId:'store',technicianId:'tech',grants:['income']});m.feature.mockResolvedValue(undefined);m.card.mockResolvedValue({id:'card'});m.ledger.mockResolvedValue([]);m.settlement.mockResolvedValue([]);m.payment.mockResolvedValue([]);m.appointments.mockResolvedValue([]);});
it('limits lazy ledger to the authenticated store and permitted shared-card membership',async()=>{
 expect((await readBeautyCardHistory('card')).success).toBe(true);expect(m.card.mock.calls[0][0].where).toEqual({id:'card',storeId:'store',memberIds:{has:'member'}});expect(m.ledger.mock.calls[0][0].where).toEqual({storeId:'store',cardId:'card'});
 m.card.mockResolvedValue(null);expect((await readBeautyCardHistory('foreign')).success).toBe(false);expect(m.ledger).toHaveBeenCalledTimes(1);
});
it('rejects revoked portal access before reading data',async()=>{m.feature.mockRejectedValue(new Error('revoked'));expect((await readBeautyWorkRecords({month:'2026-10',pending:false,search:'',page:0})).success).toBe(false);expect(m.appointments).not.toHaveBeenCalled();});
it('requires live income permission and returns only this technician fee lines without payment tracking',async()=>{
 m.worker.mockResolvedValueOnce({storeId:'store',technicianId:'tech',grants:[]});expect((await readBeautyOwnIncome('2026-10')).success).toBe(false);expect(m.settlement).not.toHaveBeenCalled();
 m.settlement.mockResolvedValue([{lines:[{id:'own',technicianId:'tech',serviceName:'face',date:'2026-10-01',fee:300},{id:'other',technicianId:'foreign',fee:900}]}]);m.payment.mockResolvedValue([{appointmentId:'own',amount:200,kind:'FEE',createdAt:new Date('2026-10-02')}]);
 const r=await readBeautyOwnIncome('2026-10');expect(r.success&&r.data).toMatchObject({confirmed:true,lines:[{id:'own',fee:300}]});expect(r.success&&r.data.lines).toHaveLength(1);expect(m.payment).not.toHaveBeenCalled();expect(r.success&&r.data.lines[0]).not.toHaveProperty('paid');
});
it('scopes paged pending work by store, technician, selected month and actual elapsed service time',async()=>{
 const input={month:'2026-11',pending:true,search:' 王 ',page:1,storeId:'foreign',technicianId:'foreign'};expect((await readBeautyWorkRecords(input)).success).toBe(true);
 expect(m.appointments.mock.calls[0][0]).toMatchObject({where:{storeId:'store',technicianId:'tech',status:'RESERVED',personName:{contains:'王',mode:'insensitive'}},skip:50,take:51,orderBy:[{startsAt:'asc'},{id:'asc'}]});expect(m.appointments.mock.calls[0][0].where.startsAt.gte).toEqual(new Date('2026-10-31T16:00:00Z'));expect(m.appointments.mock.calls[0][0].where.endsAt.lt).toBeInstanceOf(Date);
 expect((await readBeautyWorkRecords({...input,month:'bad'})).success).toBe(false);expect(m.appointments).toHaveBeenCalledTimes(1);
});

it('scopes progress and purchase facts to the authorized member in a consistent read',async()=>{
 m.readTx.mockImplementation(async run=>run({beautyCard:{findFirst:m.card}}));m.card.mockResolvedValue({id:'shared',memberIds:['member','child'],createdAt:new Date('2026-11-01'),listPrice:5000});m.progress.mockResolvedValue({available:true,total:8,completed:[],voided:[]});
 const result=await readBeautyCardProgress('shared');expect(result.success&&result.data).toMatchObject({shared:true,price:5000,purchasedAt:'2026-11-01T00:00:00.000Z'});expect(m.card).toHaveBeenCalledWith({where:{id:'shared',storeId:'store',memberIds:{has:'member'}}});expect(m.readTx).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'RepeatableRead'});
 m.progress.mockClear();m.card.mockResolvedValue(null);expect((await readBeautyCardProgress('foreign')).success).toBe(false);expect(m.progress).not.toHaveBeenCalled();
});
