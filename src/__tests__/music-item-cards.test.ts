import {beforeEach,expect,it,vi} from 'vitest';
import type {Prisma} from '../../generated/course-client';
vi.mock('@/server/services/music-item-compatibility',()=>({musicItemTemplateIds:async()=>['item-a','a1','a2']}));
vi.mock('@/server/services/music-lesson-periods',()=>({bindMusicLesson:vi.fn()}));
import {musicItemCards,readMusicItemBalances,bindMusicAttendanceCard} from '@/server/services/music-item-cards';
const session={id:'s',templateId:'item-a',startsAt:new Date('2099-01-01')};
const card=(id:string,remaining:number)=>({id,createdAt:new Date('2026-01-01'),storeId:'store',unit:'SESSION',requestKey:id,musicOpeningStateRequired:false,musicOpeningState:null,templateIds:[id],remaining,members:[{customerId:'person'}],bookings:[],termSessionIds:[],expiresAt:new Date('2099-12-31'),closedAt:null,musicJoinSessionId:null,musicValidityDays:null,musicActivatedAt:null});
function fixture(){const booking={id:'booking',customerId:'person',bookingKind:'UNPAID',cardId:null as string|null,session};return {booking,tx:{coursePointCard:{findMany:vi.fn().mockResolvedValue([card('a2',10),card('a1',2),{...card('b',100),templateIds:['b']}])},coursePurchase:{findMany:vi.fn().mockResolvedValue([{cardId:'a1',createdAt:new Date('2025-01-01')},{cardId:'a2',createdAt:new Date('2026-01-01')}])},courseSession:{findMany:vi.fn().mockResolvedValue([])},courseBooking:{findFirst:vi.fn().mockImplementation(async()=>booking),update:vi.fn().mockImplementation(async({data})=>Object.assign(booking,data))},coursePointEntry:{create:vi.fn()}}};}
let f:ReturnType<typeof fixture>;
const db=()=>f.tx as unknown as Prisma.TransactionClient;
beforeEach(()=>{f=fixture();});
it('music item A sums A1+A2, excludes B and keeps FIFO independent of product order',async()=>{
 expect((await musicItemCards(db(),'store',['person'],session)).map(c=>c.id)).toEqual(['a1','a2']);
 expect((await readMusicItemBalances(db(),'store',['person'],session)).get('person')).toMatchObject({remaining:12,available:12});
});
it('only binds rights at attendance and never silently marks the learner attended',async()=>{
 await bindMusicAttendanceCard(db(),{storeId:'store',userId:'staff'},'booking');
 expect(f.booking).toMatchObject({cardId:'a1',bookingKind:'CARD'});
 expect(f.tx.coursePointCard.findMany.mock.calls[0][0]).not.toHaveProperty('relationLoadStrategy');
 expect(f.tx.courseBooking.update).toHaveBeenCalledExactlyOnceWith({where:{id:'booking'},data:{cardId:'a1',bookingKind:'CARD',pointCost:1}});
 await bindMusicAttendanceCard(db(),{storeId:'store',userId:'staff'},'booking');
 expect(f.tx.coursePointEntry.create).toHaveBeenCalledOnce();
});
it('empty, wrong item, expired and source-bound opening rights do not become ordinary paid rights',async()=>{
 f.tx.coursePointCard.findMany.mockResolvedValue([{...card('a1',5),expiresAt:new Date('2020-01-01')},{...card('a2',3),musicOpeningStateRequired:true},{...card('b',10),templateIds:['b']}]);
 await bindMusicAttendanceCard(db(),{storeId:'store',userId:'staff'},'booking');
 expect(f.tx.courseBooking.update).not.toHaveBeenCalled();expect(f.tx.coursePointEntry.create).not.toHaveBeenCalled();
});
