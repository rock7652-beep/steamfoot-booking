import {beforeEach,it,expect,vi} from 'vitest';
import type {Tx} from '@/server/beauty/booking';
const m=vi.hoisted(()=>({visits:vi.fn(),manual:vi.fn(),closes:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/server/beauty/session-adjustment',()=>({beautySessionAdjustmentRecords:m.manual}));
import {beautyPlanProgress} from '@/server/beauty/plan-progress';
const tx={beautyAppointment:{findMany:m.visits},beautyLedger:{findMany:m.closes}} as unknown as Tx;
const card={id:'card',sessions:5,remaining:5,memberIds:['a','b']};
const manual={id:'backfill',cardId:'card',customerId:'b',customerName:'孩子乙',operation:'BACKFILL',quantity:1,occurredOn:'2026-11-02',recordedAt:'2026-11-10T16:00:00Z',reversalOf:null};
beforeEach(()=>{vi.clearAllMocks();m.visits.mockResolvedValue([]);m.manual.mockResolvedValue([]);m.closes.mockResolvedValue([]);});
it('returns every purchased slot empty before service, regardless of reservations',async()=>{
 expect(await beautyPlanProgress(tx,'store',card)).toEqual({available:true,total:5,completed:[],voided:[]});
 expect(m.visits).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:'store',cardId:'card',debit:true},take:2001}));
});
it('combines shared service dates, backfills and voids into one authoritative grid',async()=>{
 m.visits.mockResolvedValue([{id:'visit',startsAt:new Date('2026-11-01T03:00Z'),customerId:'a',personName:'孩子甲',serviceName:'護理'}]);
 m.manual.mockResolvedValue([manual,{...manual,id:'void',operation:'VOID',occurredOn:null}]);
 const r=await beautyPlanProgress(tx,'store',{...card,remaining:2},['a','b']);
 expect(r.available&&r.completed).toHaveLength(2);expect(r.available&&r.completed[1]).toMatchObject({date:'2026-11-01T16:00:00.000Z',customerName:'孩子乙'});expect(r.available&&r.voided[0].date).toBe('2026-11-10T16:00:00Z');
});
it('uses current debit state and removes reversed adjustments',async()=>{
 m.manual.mockResolvedValue([manual,{...manual,id:'reverse',operation:'REVERSE',reversalOf:'backfill'}]);
 expect(await beautyPlanProgress(tx,'store',card)).toMatchObject({available:true,completed:[],voided:[]});
});
it('uses close ledger timestamps without marking withdrawn balance as attended',async()=>{
 m.closes.mockResolvedValue([{id:'close',delta:-5,createdAt:new Date('2026-11-11T01:00Z')}]);
 const r=await beautyPlanProgress(tx,'store',{...card,remaining:0});expect(r.available&&r.completed).toEqual([]);expect(r.available&&r.voided).toHaveLength(5);
});
it('never reveals partially visible shared history',async()=>{
 expect((await beautyPlanProgress(tx,'store',card,['a'])).available).toBe(false);expect(m.visits).not.toHaveBeenCalled();
 m.visits.mockResolvedValue([{id:'old',customerId:'hidden',startsAt:new Date(),personName:'隱藏顧客'}]);expect((await beautyPlanProgress(tx,'store',card,['a','b'])).available).toBe(false);
});
it('rejects missing dates, excess usage and inconsistent balances without inventing slots',async()=>{
 m.manual.mockResolvedValue([{...manual,occurredOn:null}]);expect((await beautyPlanProgress(tx,'store',{...card,remaining:4})).available).toBe(false);
 m.manual.mockResolvedValue([{...manual,quantity:2001}]);expect((await beautyPlanProgress(tx,'store',card)).available).toBe(false);
 m.manual.mockResolvedValue([]);expect((await beautyPlanProgress(tx,'store',{...card,remaining:1})).available).toBe(false);
});
