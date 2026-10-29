import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),anchor:vi.fn(),read:vi.fn(),cards:vi.fn()}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{courseBooking:{findFirst:m.anchor},courseSession:{findFirst:m.session}}}));
vi.mock('@/server/actions/course-members',()=>({loadCourseRosterQuick:m.read}));
vi.mock('@/server/queries/course-card-browser',()=>({readCourseCards:m.cards}));
import {readPurchasedCourseRoster,readPurchasedCourseCards,readCommittedCourseRoster} from '@/server/queries/course-purchase-roster';
beforeEach(()=>{vi.clearAllMocks();m.anchor.mockResolvedValue({sessionId:'class'});m.read.mockResolvedValue({success:true,data:{roster:[{id:'row',status:'RESERVED'}]}});});
it('anchors the projection to the purchased learner and current store, retaining read guards',async()=>{
 expect(await readPurchasedCourseRoster('store','learner','booking')).toMatchObject({sessionId:'class',data:{roster:[{status:'RESERVED'}]}});
 expect(m.anchor).toHaveBeenCalledWith({where:{id:'booking',storeId:'store',customerId:'learner',status:{not:'CANCELLED'}},select:{sessionId:true}});expect(m.read).toHaveBeenCalledWith('class');
});
it('cannot expose a foreign/cancelled anchor or turn a failed projection into another purchase',async()=>{
 m.anchor.mockResolvedValue(null);expect(await readPurchasedCourseRoster('store','learner','foreign')).toBeNull();expect(m.read).not.toHaveBeenCalled();
 m.anchor.mockResolvedValue({sessionId:'class'});m.read.mockResolvedValue({success:false,error:'denied'});expect(await readPurchasedCourseRoster('store','learner','booking')).toBeNull();
 m.read.mockRejectedValue(Error('offline'));expect(await readPurchasedCourseRoster('store','learner','booking')).toBeNull();
});
it('retains independent card visibility checks and degrades safely after commit',async()=>{
 m.cards.mockResolvedValue({success:true,rows:[],totals:[]});expect(await readPurchasedCourseCards('learner')).toMatchObject({customerId:'learner',result:{success:true}});
 expect(m.cards).toHaveBeenCalledWith({customerId:'learner'},false,undefined,true);
 m.cards.mockResolvedValue({success:false});expect(await readPurchasedCourseCards('learner')).toBeNull();
});
it('anchors committed attendance to an active local session and retains the independent roster grant',async()=>{
 m.session.mockResolvedValue({id:'class'});expect(await readCommittedCourseRoster('store','class')).toMatchObject({sessionId:'class'});
 expect(m.session).toHaveBeenCalledWith({where:{id:'class',storeId:'store',cancelledAt:null},select:{id:true}});expect(m.read).toHaveBeenCalledWith('class');
 m.read.mockResolvedValue({success:false});expect(await readCommittedCourseRoster('store','class')).toBeNull();
 m.session.mockResolvedValue(null);m.read.mockClear();expect(await readCommittedCourseRoster('store','foreign')).toBeNull();expect(m.read).not.toHaveBeenCalled();
});
