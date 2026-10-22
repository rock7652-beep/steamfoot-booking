import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({member:vi.fn(),worker:vi.fn(),feature:vi.fn(),card:vi.fn(),ledger:vi.fn(),settlement:vi.fn(),payment:vi.fn(),appointments:vi.fn(),portal:vi.fn()}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{beautyCard:{findFirst:m.card},beautyLedger:{findMany:m.ledger},beautySettlement:{findMany:m.settlement},beautyPayment:{findMany:m.payment},beautyAppointment:{findMany:m.appointments}}}));
vi.mock('@/server/beauty/access',()=>({beautyMember:m.member,beautyWorker:m.worker}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/server/beauty/booking',()=>({publicReceipt:(b:Record<string,unknown>)=>({id:b.id,startsAt:b.startsAt,endsAt:b.endsAt,status:b.status})}));
import {readBeautyCardHistory,readBeautyOwnIncome,readBeautyWorkRecords} from '@/server/actions/beauty-portal';
beforeEach(()=>{vi.clearAllMocks();m.member.mockResolvedValue({storeId:'store',customerId:'member'});m.worker.mockResolvedValue({storeId:'store',technicianId:'tech',grants:['income']});m.feature.mockResolvedValue(undefined);m.card.mockResolvedValue({id:'card'});m.ledger.mockResolvedValue([]);m.settlement.mockResolvedValue([]);m.payment.mockResolvedValue([]);m.appointments.mockResolvedValue([]);});
it('limits lazy ledger to the authenticated store and permitted shared-card membership',async()=>{
 expect((await readBeautyCardHistory('card')).success).toBe(true);expect(m.card.mock.calls[0][0].where).toEqual({id:'card',storeId:'store',memberIds:{has:'member'}});expect(m.ledger.mock.calls[0][0].where).toEqual({storeId:'store',cardId:'card'});
 m.card.mockResolvedValue(null);expect((await readBeautyCardHistory('foreign')).success).toBe(false);expect(m.ledger).toHaveBeenCalledTimes(1);
});
it('rejects revoked portal access before reading data',async()=>{m.feature.mockRejectedValue(new Error('revoked'));expect((await readBeautyWorkRecords({month:'2026-10',pending:false,search:'',page:0})).success).toBe(false);expect(m.appointments).not.toHaveBeenCalled();});
it('requires live income permission and filters confirmed-version lines and payments to this technician',async()=>{
 m.worker.mockResolvedValueOnce({storeId:'store',technicianId:'tech',grants:[]});expect((await readBeautyOwnIncome('2026-10')).success).toBe(false);expect(m.settlement).not.toHaveBeenCalled();
 m.settlement.mockResolvedValue([{lines:[{id:'own',technicianId:'tech',serviceName:'face',date:'2026-10-01',fee:300},{id:'other',technicianId:'foreign',fee:900}]}]);m.payment.mockResolvedValue([{appointmentId:'own',amount:200,kind:'FEE',createdAt:new Date('2026-10-02')}]);
 const r=await readBeautyOwnIncome('2026-10');expect(r.success&&r.data).toMatchObject({confirmed:true,lines:[{id:'own',paid:200}]});expect(r.success&&r.data.lines).toHaveLength(1);expect(m.payment.mock.calls[0][0].where).toMatchObject({storeId:'store',technicianId:'tech'});
});
it('scopes paged pending work by store, technician, selected month and actual elapsed service time',async()=>{
 const input={month:'2026-11',pending:true,search:' 王 ',page:1,storeId:'foreign',technicianId:'foreign'};expect((await readBeautyWorkRecords(input)).success).toBe(true);
 expect(m.appointments.mock.calls[0][0]).toMatchObject({where:{storeId:'store',technicianId:'tech',status:'RESERVED',personName:{contains:'王',mode:'insensitive'}},skip:50,take:51,orderBy:[{startsAt:'asc'},{id:'asc'}]});expect(m.appointments.mock.calls[0][0].where.startsAt.gte).toEqual(new Date('2026-10-31T16:00:00Z'));expect(m.appointments.mock.calls[0][0].where.endsAt.lt).toBeInstanceOf(Date);
 expect((await readBeautyWorkRecords({...input,month:'bad'})).success).toBe(false);expect(m.appointments).toHaveBeenCalledTimes(1);
});
