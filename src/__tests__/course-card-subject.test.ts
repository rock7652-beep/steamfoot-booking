import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {cardSubjectRevision,confirmCardSubject} from '@/server/services/course-card-subject';
import type {Prisma} from '../../generated/course-client';
const card=()=>({id:'card',sportsMode:'OPEN',sportsSubjectId:null,sportsCost:null,unit:'SESSION',remaining:19,expiresAt:new Date('2099-02-08'),closedAt:null,musicOpeningStateRequired:false,requestKey:'original-purchase',templateIds:[],members:[{customerId:'learner'}],bookings:[] as {id:string;pointCost:number;session:{template:{musicSubjectId:string}}}[]});
const m={read:vi.fn(),subject:vi.fn(),templates:vi.fn(),update:vi.fn(),receipt:vi.fn(),audit:vi.fn()};
const tx={$queryRaw:m.receipt,$executeRaw:m.audit,coursePointCard:{findFirst:m.read,update:m.update},musicSubject:{findFirst:m.subject},courseTemplate:{findMany:m.templates}} as unknown as Prisma.TransactionClient;
const actor={storeId:'store',userId:'owner'};
let current=card();
const input=()=>({cardId:'card',customerId:'learner',subjectId:'A',cost:1,expectedRevision:cardSubjectRevision(current),requestKey:'request'});
beforeEach(()=>{vi.clearAllMocks();current=card();m.read.mockImplementation(async()=>current);m.receipt.mockResolvedValue([]);m.subject.mockResolvedValue({id:'A'});m.templates.mockResolvedValue([{id:'A-template'}]);});
it('only changes subject scope and records preserved balance/expiry in an audit',async()=>{
 await confirmCardSubject(tx,actor,input());
 expect(m.read).toHaveBeenCalledWith(expect.objectContaining({where:{id:'card',storeId:'store'}}));
 expect(m.update).toHaveBeenCalledWith({where:{id:'card'},data:{sportsMode:'ASSIGNED',sportsSubjectId:'A',sportsCost:1,templateIds:['A-template']}});
 expect(m.audit).toHaveBeenCalledOnce();expect(current.remaining).toBe(19);expect(current.expiresAt.toISOString()).toBe('2099-02-08T00:00:00.000Z');
});
it('rejects stale revisions and nonmembers without modifying the card',async()=>{
 const d=input();current.remaining=18;await expect(confirmCardSubject(tx,actor,d)).rejects.toThrow('已變更');
 current=card();await expect(confirmCardSubject(tx,actor,{...input(),customerId:'stranger'})).rejects.toThrow('找不到');expect(m.update).not.toHaveBeenCalled();
});
it.each(['yjy-pilot-source','no-show-makeup:original','music-leave-makeup:original'])('protects source-bound cards: %s',async requestKey=>{current.requestKey=requestKey;await expect(confirmCardSubject(tx,actor,input())).rejects.toThrow('不適用');expect(m.update).not.toHaveBeenCalled();});
it('rejects a conflicting existing reservation and non-unit session cost',async()=>{
 current.bookings=[{id:'booking',pointCost:1,session:{template:{musicSubjectId:'B'}}}];
 await expect(confirmCardSubject(tx,actor,input())).rejects.toThrow('不同科目');current.bookings=[];
 await expect(confirmCardSubject(tx,actor,{...input(),cost:2})).rejects.toThrow('1 堂');expect(m.update).not.toHaveBeenCalled();
});
it('accepts same-subject holds while retaining the hold and all shared members',async()=>{current.members.push({customerId:'shared'});current.bookings=[{id:'booking',pointCost:1,session:{template:{musicSubjectId:'A'}}}];await confirmCardSubject(tx,actor,input());expect(m.update).toHaveBeenCalledOnce();expect(current.members).toHaveLength(2);expect(current.bookings).toHaveLength(1);});
it('replays the same receipt once and rejects request key reuse',async()=>{
 // Capture the actual persisted fingerprint rather than duplicating its algorithm.
 await confirmCardSubject(tx,actor,input());const after=m.audit.mock.calls[0].find((v:unknown)=>typeof v==='string'&&v.includes('remainingPreserved'));
 m.receipt.mockResolvedValue([{afterJson:JSON.parse(after)}]);m.update.mockClear();m.audit.mockClear();
 await confirmCardSubject(tx,actor,input());expect(m.update).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
 await expect(confirmCardSubject(tx,actor,{...input(),subjectId:'B'})).rejects.toThrow('識別已使用');
});
it('rejects an inactive or foreign subject even when a client sends its id',async()=>{m.subject.mockResolvedValue(null);await expect(confirmCardSubject(tx,actor,input())).rejects.toThrow('本店有效科目');expect(m.update).not.toHaveBeenCalled();expect(m.subject.mock.calls[0][0].where).toEqual({id:'A',storeId:'store',isActive:true});});
