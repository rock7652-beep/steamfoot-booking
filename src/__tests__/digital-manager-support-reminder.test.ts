import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({findMany:vi.fn(),findFirst:vi.fn(),query:vi.fn(),create:vi.fn(),remove:vi.fn(),update:vi.fn(),record:vi.fn(),resolve:vi.fn(),notify:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$queryRaw:m.query,digitalButlerLead:{findMany:m.findMany,findFirst:m.findFirst},digitalButlerExecutionLog:{create:m.create,delete:m.remove,update:m.update}}}));
vi.mock('@/server/services/digital-manager-notices',()=>({recordDigitalManagerNotice:m.record,resolveDigitalManagerNotice:m.resolve}));
vi.mock('@/server/services/store-manager-line-notifications',()=>({notifyStoreManagerOnLine:m.notify}));
vi.mock('@/lib/line',()=>({getUserProfile:vi.fn()}));
import {runHumanSupportFinalReminders} from '@/server/services/human-support-handoff';
beforeEach(()=>{vi.resetAllMocks();m.findMany.mockResolvedValue([{id:'lead',storeId:'a',store:{slug:'a'}}]);m.query.mockResolvedValue([]);m.findFirst.mockResolvedValue({id:'lead'});m.create.mockResolvedValue({id:'claim'});m.remove.mockResolvedValue({});m.notify.mockResolvedValue({status:'skipped',reason:'recipient_not_configured'});});
it('records the reminder even when manager LINE delivery is unavailable',async()=>{
 await runHumanSupportFinalReminders(new Date('2026-10-30T04:00:00Z'));
 expect(m.record).toHaveBeenCalledWith(expect.anything(),{storeId:'a',eventKey:'human-support-final-reminder:lead',eventType:'HUMAN_SUPPORT_FINAL_REMINDER',targetId:'lead'});
 expect(m.remove).toHaveBeenCalledWith({where:{id:'claim'}});
});
it('does not record or send when support was already assigned',async()=>{
 m.findFirst.mockResolvedValue(null);await runHumanSupportFinalReminders();
 expect(m.record).not.toHaveBeenCalled();expect(m.notify).not.toHaveBeenCalled();
});
it('records the store reminder even when the LINE delivery claim already exists',async()=>{
 const {Prisma}=await import('@prisma/client');m.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate',{code:'P2002',clientVersion:'test'}));
 await runHumanSupportFinalReminders();expect(m.record).toHaveBeenCalledOnce();expect(m.notify).not.toHaveBeenCalled();
});
it('resolves a reminder if staff assignment wins before the insert',async()=>{
 m.findFirst.mockResolvedValueOnce({id:'lead'}).mockResolvedValueOnce(null);
 await runHumanSupportFinalReminders();
 expect(m.resolve).toHaveBeenCalledWith(expect.anything(),{storeId:'a',eventKey:'human-support-final-reminder:lead',actorUserId:'system',actorName:'系統'});
 expect(m.create).not.toHaveBeenCalled();expect(m.notify).not.toHaveBeenCalled();
});
it('also processes unrecorded leads beyond the existing LINE scan',async()=>{
 m.query.mockResolvedValue([{id:'later',storeId:'b',store:{slug:'b'}}]);await runHumanSupportFinalReminders();
 expect(m.record).toHaveBeenCalledWith(expect.anything(),{storeId:'b',eventKey:'human-support-final-reminder:later',eventType:'HUMAN_SUPPORT_FINAL_REMINDER',targetId:'later'});
 expect(m.record).toHaveBeenCalledTimes(2);
 expect(m.notify).toHaveBeenCalledTimes(1);
});
it('still records unrecorded leads when the existing LINE scan fails',async()=>{
 m.findMany.mockRejectedValue(new Error('LINE scan unavailable'));m.query.mockResolvedValue([{id:'later',storeId:'b',store:{slug:'b'}}]);
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{const result=await runHumanSupportFinalReminders();expect(result.failed).toBe(1);expect(m.record).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({storeId:'b',targetId:'later'}));expect(m.notify).not.toHaveBeenCalled();}finally{log.mockRestore();}
});
