import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({leaveIds:vi.fn(),actor:vi.fn(),customer:vi.fn(),people:vi.fn(),cards:vi.fn(),adjustments:vi.fn(),purchases:vi.fn(),tuition:vi.fn(),tx:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManagerRead:m.actor}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findFirst:m.customer,findMany:m.people}}}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{$transaction:m.tx}}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:()=>({assignedStaffId:'visible-staff'})}));
vi.mock('@/server/services/music-plan-scope',()=>({musicCardWhere:()=>({})}));
vi.mock('@/server/services/course-session-adjustment-records',()=>({courseSessionAdjustmentRecords:m.adjustments}));
vi.mock('@/server/services/course-progress-deducted-leaves',()=>({readProgressDeductedLeaveIds:m.leaveIds}));
vi.mock('@/server/services/music-tuition',()=>({readMusicTuition:m.tuition}));
import {readCourseCardProgressBatch} from '@/server/services/course-card-progress-batch';
const input={cardIds:['a','b'],customerId:'student',expectedStoreId:'store'};
const card=(id:string)=>({id,unit:'SESSION',requestKey:'purchase',musicOpeningStateRequired:false,members:[{customerId:'student'}],entries:[{points:10}],bookings:[{id:id+'-lesson',customerId:'student',pointCost:1,status:'ATTENDED',absenceKind:null,session:{startsAt:new Date('2026-11-01T08:00Z'),nameSnapshot:'吉他'}}]});
beforeEach(()=>{
 vi.clearAllMocks();m.leaveIds.mockResolvedValue([]);m.actor.mockResolvedValue({storeId:'store',user:{id:'owner',role:'PARTNER',staffId:'visible-staff'}});m.customer.mockResolvedValue({id:'student'});m.people.mockResolvedValue([{id:'student',name:'學員'}]);m.cards.mockResolvedValue([card('a'),card('b')]);m.adjustments.mockResolvedValue([]);m.purchases.mockResolvedValue([{id:'order',cardId:'a',customerId:'student',price:0,createdAt:new Date('2026-10-01T02:00Z')}]);m.tuition.mockResolvedValue(new Map([['order',{due:800}]]));m.tx.mockImplementation(async work=>work({coursePointCard:{findMany:m.cards},coursePurchase:{findMany:m.purchases}}));
});
it('projects each card separately with one batch per data source and the existing tuition amount',async()=>{
 const result=await readCourseCardProgressBatch(input);
 expect(result).toMatchObject([{cardId:'a',result:{success:true,data:{available:true,total:10,purchasePrice:800,completed:[{id:'a-lesson'}]}}},{cardId:'b',result:{success:true,data:{available:true,purchasePrice:null,completed:[{id:'b-lesson'}]}}}]);
 for(const read of [m.cards,m.people,m.adjustments,m.purchases,m.tuition,m.customer])expect(read).toHaveBeenCalledOnce();
 expect(m.actor.mock.calls.map(c=>c[0])).toEqual(['wallet.read','customer.read','booking.read','transaction.read']);
 expect(m.cards.mock.calls[0][0]).toMatchObject({where:{storeId:'store',id:{in:['a','b']},OR:[{members:{some:{customerId:'student',storeId:'store'}}},{bookings:{some:{customerId:'student',storeId:'store'}}}]},select:{bookings:{take:2001,where:{OR:[{status:{in:['ATTENDED','NO_SHOW']}},{status:'CANCELLED',absenceKind:'GROUP_LEAVE_FORFEITED'}],bookingKind:{not:'OPENING_MAKEUP'}}}}});
 expect(m.people.mock.calls[0][0].where).toMatchObject({assignedStaffId:'visible-staff',storeId:'store',mergedIntoCustomerId:null});
});
it('withholds an invisible shared card without suppressing an unrelated visible card',async()=>{
 m.cards.mockResolvedValue([{...card('a'),members:[{customerId:'student'},{customerId:'hidden'}]},card('b')]);
 const result=await readCourseCardProgressBatch(input);expect(result[0]).toMatchObject({result:{success:true,data:{available:false}}});expect(result[1]).toMatchObject({result:{success:true,data:{available:true}}});expect(JSON.stringify(result[0])).not.toContain('a-lesson');
});
it('retains the per-card overflow and missing-card errors',async()=>{
 const a=card('a');m.cards.mockResolvedValue([{...a,bookings:Array.from({length:2001},()=>a.bookings[0])}]);
 const result=await readCourseCardProgressBatch(input);expect(result).toMatchObject([{result:{success:true,data:{available:false}}},{result:{success:false}}]);
});
it.each(['wallet.read','booking.read','customer.read'])('rejects missing %s before loading cards',async permission=>{
 m.actor.mockImplementation(async p=>{if(p===permission)throw Error('denied');return {storeId:'store',user:{id:'owner'}};});expect(await readCourseCardProgressBatch(input)).toMatchObject([{result:{success:false}},{result:{success:false}}]);expect(m.cards).not.toHaveBeenCalled();
});
it('rejects foreign stores and hidden customers before the transaction',async()=>{
 expect(await readCourseCardProgressBatch({...input,expectedStoreId:'other'})).toMatchObject([{result:{success:false}},{result:{success:false}}]);expect(m.tx).not.toHaveBeenCalled();
 m.customer.mockResolvedValue(null);expect(await readCourseCardProgressBatch(input)).toMatchObject([{result:{success:false}},{result:{success:false}}]);expect(m.tx).not.toHaveBeenCalled();
});
it('does not read or expose purchase amounts without financial permission',async()=>{
 m.actor.mockImplementation(async p=>{if(p==='transaction.read')throw Error('denied');return{storeId:'store',user:{id:'owner'}};});
 expect(await readCourseCardProgressBatch(input)).toMatchObject([{result:{data:{canReadPrice:false,purchasePrice:null}}},{result:{data:{canReadPrice:false,purchasePrice:null}}}]);expect(m.purchases).not.toHaveBeenCalled();
});
it('rejects oversized batches before accessing any customer',async()=>{
 await expect(readCourseCardProgressBatch({...input,cardIds:Array.from({length:21},(_,i)=>String(i))})).rejects.toThrow();expect(m.customer).not.toHaveBeenCalled();
});

it('keeps preloaded absence kinds identical to the single reader without mixing cards',async()=>{
 m.leaveIds.mockResolvedValue(['native-leave']);
 const a=card('a'),b=card('b');
 m.cards.mockResolvedValue([{...a,bookings:[{...a.bookings[0],status:'NO_SHOW'}]},{...b,bookings:[{...b.bookings[0],status:'CANCELLED',absenceKind:'STUDENT_LEAVE'}]}]);
 const result=await readCourseCardProgressBatch(input);
 expect(result).toMatchObject([{cardId:'a',result:{data:{completed:[{id:'a-lesson',usageKind:'NO_SHOW'}]}}},{cardId:'b',result:{data:{completed:[{id:'b-lesson',usageKind:'LEAVE'}]}}}]);
 expect(m.leaveIds).toHaveBeenCalledOnce();
 expect(m.cards.mock.calls[0][0].select.bookings.where.OR).toContainEqual({id:{in:['native-leave']},status:'CANCELLED',absenceKind:'STUDENT_LEAVE'});
});
