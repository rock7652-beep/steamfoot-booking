import {beforeEach,describe,expect,it,vi} from 'vitest';
import {sessionAdjustmentInput,activeSessionAdjustments,type SessionAdjustmentRecord} from '@/lib/plan-session-adjustment';
const m=vi.hoisted(()=>({gridCards:vi.fn(),slots:vi.fn().mockResolvedValue([]),activation:vi.fn().mockResolvedValue({})}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{coursePointCard:{findMany:m.gridCards}}}));
vi.mock('@/server/services/music-session-adjustment',()=>({musicAdjustmentSlots:m.slots,syncMusicAdjustmentActivation:m.activation}));
vi.mock('@/server/beauty/access',()=>({command:async(_tx:unknown,_a:unknown,_key:unknown,_intent:unknown,work:()=>unknown)=>work()}));
import {BackfillReviewRequired} from '@/server/services/course-backfill-review';
import {readCoursePhonePlanGrids} from '@/server/queries/course-phone-plan-grids';
import {adjustCourseSessions} from '@/server/services/course-session-adjustment';
import {adjustBeautySessions} from '@/server/beauty/session-adjustment';
const actor={storeId:'store',userId:'manager',name:'店長',role:'OWNER',manager:true};
const expiry='2027-12-31T15:59:59.999Z';
const input=()=>sessionAdjustmentInput.parse({expectedStoreId:'store',requestKey:crypto.randomUUID(),cardId:'card',customerId:'learner',operation:'BACKFILL',quantity:1,expectedRemaining:10,expectedExpiresAt:expiry,occurredOn:'2026-01-02'});
function fixture(){
  const receipts=new Map<string,{fingerprint:string;record:SessionAdjustmentRecord;expiresAt:string|null}>(),events=new Map<string,{body:string}>();
  const card={id:'card',storeId:'store',memberIds:['learner'],members:[{customerId:'learner'}],remaining:10,closedAt:null,expiresAt:new Date(expiry),requestKey:'purchase',unit:'SESSION',musicOpeningStateRequired:false,musicValidityDays:null};
  const tx={
    coursePointCard:{findFirst:vi.fn(async()=>({...card})),update:vi.fn(async({data}: {data:{remaining:number}})=>Object.assign(card,data))},
    courseBooking:{findMany:vi.fn().mockResolvedValue([]),aggregate:vi.fn().mockResolvedValue({_sum:{pointCost:0}})},coursePointEntry:{create:vi.fn()},
    beautyCard:{findFirst:vi.fn(async()=>({...card})),update:vi.fn(async({data}: {data:{remaining:number}})=>Object.assign(card,data))},
    beautyAppointment:{count:vi.fn().mockResolvedValue(0)},beautyLedger:{create:vi.fn()},
    beautyEvent:{create:vi.fn(async({data}:{data:{id:string;body:string}})=>{events.set(data.id,{body:data.body});})},
    beautyCommand:{findUnique:vi.fn(),create:vi.fn()},
    $queryRaw:vi.fn(async(strings:TemplateStringsArray,...values:unknown[])=>{
      const sql=strings.join('?');
      if(sql.includes('WHERE id='))return receipts.has(String(values[0]))?[{afterJson:receipts.get(String(values[0]))}]:[];
      if(sql.includes('BeautyEvent'))return [...events.values()];
      return [...receipts.values()].map(afterJson=>({afterJson}));
    }),
    $executeRaw:vi.fn(async(_strings:TemplateStringsArray,...values:unknown[])=>{const payload=values.find(v=>typeof v==='string'&&v.startsWith('{"fingerprint"'));if(payload)receipts.set(String(values[0]),JSON.parse(payload as string));return 1;}),
  };
  return {tx,card,receipts,events};
}
beforeEach(()=>{vi.clearAllMocks();m.slots.mockResolvedValue([]);m.activation.mockResolvedValue({});});
describe.each(['course','beauty'] as const)('%s plan session adjustment',module=>{
  const run=(f:ReturnType<typeof fixture>,d:ReturnType<typeof input>)=>module==='course'?adjustCourseSessions(f.tx as never,actor,d,'學員'):adjustBeautySessions(f.tx as never,actor,d,'學員');
  it('backfills a past class and debits quota, reason optional, without creating bookings or money',async()=>{
    const f=fixture();const result=await run(f,input());
    expect(result).toMatchObject({remaining:9,record:{operation:'BACKFILL',occurredOn:'2026-01-02',reason:'',customerName:'學員',actorName:'店長',remainingBefore:10,remainingAfter:9}});
    expect(Number.isFinite(Date.parse(result.record.recordedAt))).toBe(true);
    expect(f.card.remaining).toBe(9);expect(f.tx.courseBooking).not.toHaveProperty('create');expect(f.tx).not.toHaveProperty('beautyPayment');
    const write=module==='course'?f.tx.coursePointEntry.create:f.tx.beautyLedger.create;
    expect(write).toHaveBeenCalledOnce();
  });
  it('voids selected units without closing the card or inventing a class date',async()=>{
    const f=fixture();const result=await run(f,{...input(),operation:'VOID',quantity:3,occurredOn:undefined});
    expect(result.record).toMatchObject({operation:'VOID',quantity:3,occurredOn:null,remainingAfter:7});
    expect(f.card.closedAt).toBeNull();expect(m.activation).not.toHaveBeenCalled();
  });
  it('returns units once by appending a correction, retaining the original history',async()=>{
    const f=fixture();const first=await run(f,input());
    const correction={...input(),expectedRemaining:9,operation:'REVERSE' as const,reversalOf:first.record.id};
    const result=await run(f,correction);expect(result.remaining).toBe(10);expect(result.record.reversalOf).toBe(first.record.id);
    expect(activeSessionAdjustments([first.record,result.record])).toHaveLength(0);
    await expect(run(f,{...correction,requestKey:crypto.randomUUID(),expectedRemaining:10})).rejects.toThrow('已更正');
  });
  it.each(['held','insufficient','stale','foreign-store','foreign-member','closed','beyond-expiry','foreign-reversal'])('rejects %s before writing',async kind=>{
    const f=fixture();const d=input();
    if(kind==='held'){f.tx.courseBooking.aggregate.mockResolvedValue({_sum:{pointCost:10}});f.tx.beautyAppointment.count.mockResolvedValue(10);}
    if(kind==='insufficient')d.quantity=11;
    if(kind==='stale')d.expectedRemaining=9;
    if(kind==='foreign-store')d.expectedStoreId='other';
    if(kind==='foreign-member')d.customerId='other';
    if(kind==='closed')f.card.closedAt=new Date() as never;
    if(kind==='beyond-expiry'){f.card.expiresAt=new Date('2025-12-31T15:59:59.999Z');d.expectedExpiresAt=f.card.expiresAt.toISOString();}
    if(kind==='foreign-reversal'){d.operation='REVERSE';d.reversalOf='other-card-entry';}
    await expect(run(f,d)).rejects.toThrow();
    expect(f.tx.coursePointCard.update).not.toHaveBeenCalled();expect(f.tx.beautyCard.update).not.toHaveBeenCalled();
    expect(f.tx.coursePointEntry.create).not.toHaveBeenCalled();expect(f.tx.beautyLedger.create).not.toHaveBeenCalled();
  });
});
it('course lost-reply retry returns the original receipt instead of debiting again',async()=>{
  const f=fixture(),d=input();const first=await adjustCourseSessions(f.tx as never,actor,d,'學員');
  expect(await adjustCourseSessions(f.tx as never,actor,d,'學員')).toEqual(first);
  expect(f.tx.coursePointCard.update).toHaveBeenCalledOnce();expect(f.tx.coursePointEntry.create).toHaveBeenCalledOnce();
  await expect(adjustCourseSessions(f.tx as never,actor,{...d,quantity:2},'學員')).rejects.toThrow('識別碼');
});
it.each(['2026-02-30','2026-13-01','2099-01-01',''])('validates historical class date %s',occurredOn=>{
  expect(sessionAdjustmentInput.safeParse({...input(),occurredOn}).success).toBe(false);
});
it('keeps protected music opening and makeup cards in their original workflows',async()=>{
  const f=fixture();f.card.musicOpeningStateRequired=true;
  await expect(adjustCourseSessions(f.tx as never,actor,input(),'學員')).rejects.toThrow('專用流程');
  expect(f.tx.coursePointCard.update).not.toHaveBeenCalled();
});

async function duplicateReview(f:ReturnType<typeof fixture>,d:ReturnType<typeof input>){
 try{await adjustCourseSessions(f.tx as never,actor,d,'學員');throw Error('Expected duplicate review');}
 catch(error){if(!(error instanceof BackfillReviewRequired))throw error;return error.review;}
}
it('requires an explicit review before another backfill on a day already debited, then retries the confirmed command only once',async()=>{
 const f=fixture(),d=input();f.tx.courseBooking.findMany.mockResolvedValue([{id:'attended',pointCost:1,status:'ATTENDED',absenceKind:null}]);
 const review=await duplicateReview(f,d);expect(review.existingQuantity).toBe(1);expect(f.card.remaining).toBe(10);expect(f.tx.coursePointEntry.create).not.toHaveBeenCalled();
 expect(f.tx.courseBooking.findMany.mock.calls[0][0].where).toMatchObject({storeId:'store',cardId:'card',customerId:'learner',pointCost:{gt:0},session:{startsAt:{gte:new Date('2026-01-01T16:00:00Z'),lte:new Date('2026-01-02T15:59:59.999Z')}}});
 const confirmed={...d,duplicateAcknowledgement:review.token};const first=await adjustCourseSessions(f.tx as never,actor,confirmed,'學員');
 expect(first).toMatchObject({remaining:9,record:{duplicateConfirmed:true}});
 expect(await adjustCourseSessions(f.tx as never,actor,confirmed,'學員')).toEqual(first);expect(f.tx.coursePointEntry.create).toHaveBeenCalledOnce();
});
it('recognizes active manual backfills after reopening, but excludes reversed entries',async()=>{
 const f=fixture(),d=input();const first=await adjustCourseSessions(f.tx as never,actor,d,'學員');
 const next={...d,requestKey:crypto.randomUUID(),expectedRemaining:9};const review=await duplicateReview(f,next);expect(review.existingQuantity).toBe(1);expect(f.card.remaining).toBe(9);
 const reversed=await adjustCourseSessions(f.tx as never,actor,{...next,operation:'REVERSE',reversalOf:first.record.id},'學員');expect(reversed.remaining).toBe(10);
 expect(await adjustCourseSessions(f.tx as never,actor,{...d,requestKey:crypto.randomUUID()},'學員')).toMatchObject({remaining:9});
});
it.each(['quantity','date','reason','evidence','request'])('requires a new review when %s changes after confirmation',async kind=>{
 const f=fixture(),d=input();f.tx.courseBooking.findMany.mockResolvedValue([{id:'attended',pointCost:1,status:'ATTENDED',absenceKind:null}]);const review=await duplicateReview(f,d);
 const changed={...d,duplicateAcknowledgement:review.token};
 if(kind==='quantity')changed.quantity=2;if(kind==='date')changed.occurredOn='2026-01-03';if(kind==='reason')changed.reason='新原因';if(kind==='request')changed.requestKey=crypto.randomUUID();
 if(kind==='evidence')f.tx.courseBooking.findMany.mockResolvedValue([{id:'other',pointCost:1,status:'ATTENDED',absenceKind:null}]);
 const next=await duplicateReview(f,changed);expect(next.token).not.toBe(review.token);expect(f.card.remaining).toBe(10);expect(f.tx.coursePointEntry.create).not.toHaveBeenCalled();
});

// Run the real adjustment service, audit record parser and grid projection
// together against one shared card; database I/O is isolated in the fixture.
it('keeps a shared plan balance and dated grid consistent across both learners, voids, corrections and retries',async()=>{
 const f=fixture(),ownCard={id:'independent',remaining:8};
 f.card.members.push({customerId:'child-b'});
 m.gridCards.mockImplementation(async()=>[{id:'card',members:f.card.members,entries:[{points:10}],bookings:[]},{id:ownCard.id,members:[{customerId:'learner'}],entries:[{points:8}],bookings:[]}]);
 const read=async()=>{
  const records=[...f.receipts.values()].map(row=>row.record);
  const grids=await readCoursePhonePlanGrids('store','learner',['card',ownCard.id],records,['learner','child-b']);
  const grid=grids.get('card')!;
  expect(grid.total).toBe(10);
  expect(grid.completed?.map(row=>row.date)).toEqual(grid.dates);
  expect(grid.dates.length+(grid.voidedDates?.length??0)+f.card.remaining).toBe(10);
  expect(grids.get(ownCard.id)).toEqual({total:8,dates:[],completed:[]});expect(ownCard.remaining).toBe(8);
  for(const [arg] of f.tx.coursePointCard.update.mock.calls)expect(arg).toMatchObject({where:{id:'card'}});
  return grid;
 };
 const run=async(customerId:string,operation:'BACKFILL'|'VOID'|'REVERSE',quantity:number,occurredOn?:string,reversalOf?:string)=>{
  const d={...input(),customerId,operation,quantity,occurredOn,reversalOf,expectedRemaining:f.card.remaining};
  return {d,result:await adjustCourseSessions(f.tx as never,actor,d,customerId)};
 };
 expect((await read()).dates).toEqual([]);
 const a=await run('learner','BACKFILL',2,'2026-01-02');
 expect(f.card.remaining).toBe(8);expect((await read()).dates).toEqual(['2026-01-01T16:00:00.000Z','2026-01-01T16:00:00.000Z']);
 const b=await run('child-b','BACKFILL',1,'2026-01-03');
 expect(f.card.remaining).toBe(7);expect((await read()).dates).toHaveLength(3);
 const v=await run('child-b','VOID',1);
 expect(f.card.remaining).toBe(6);expect((await read()).voidedDates).toEqual([v.result.record.recordedAt]);
 expect(await adjustCourseSessions(f.tx as never,actor,v.d,'child-b')).toEqual(v.result);
 expect(f.card.remaining).toBe(6);expect((await read()).voidedDates).toHaveLength(1);
 const correction=await run('child-b','REVERSE',1,undefined,v.result.record.id);
 expect(f.card.remaining).toBe(7);expect((await read()).voidedDates??[]).toEqual([]);expect((await read()).dates).toHaveLength(3);
 expect(await adjustCourseSessions(f.tx as never,actor,correction.d,'child-b')).toEqual(correction.result);
 await expect(run('child-b','REVERSE',1,undefined,v.result.record.id)).rejects.toThrow('已更正');
 expect(f.card.remaining).toBe(7);
 await run('learner','REVERSE',2,undefined,a.result.record.id);
 expect(f.card.remaining).toBe(9);expect((await read()).dates).toEqual(['2026-01-02T16:00:00.000Z']);
 expect([...f.receipts.values()].map(row=>row.record)).toHaveLength(5);
 expect(b.result.record.customerId).toBe('child-b');
});
