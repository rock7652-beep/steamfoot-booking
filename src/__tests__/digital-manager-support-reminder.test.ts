import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({findMany:vi.fn(),findFirst:vi.fn(),create:vi.fn(),remove:vi.fn(),update:vi.fn(),record:vi.fn(),notify:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{digitalButlerLead:{findMany:m.findMany,findFirst:m.findFirst},digitalButlerExecutionLog:{create:m.create,delete:m.remove,update:m.update}}}));
vi.mock('@/server/services/digital-manager-notices',()=>({recordDigitalManagerNotice:m.record}));
vi.mock('@/server/services/store-manager-line-notifications',()=>({notifyStoreManagerOnLine:m.notify}));
vi.mock('@/lib/line',()=>({getUserProfile:vi.fn()}));
import {runHumanSupportFinalReminders} from '@/server/services/human-support-handoff';
beforeEach(()=>{vi.resetAllMocks();m.findMany.mockResolvedValue([{id:'lead',storeId:'a',store:{slug:'a'}}]);m.findFirst.mockResolvedValue({id:'lead'});m.create.mockResolvedValue({id:'claim'});m.remove.mockResolvedValue({});m.notify.mockResolvedValue({status:'skipped',reason:'recipient_not_configured'});});
it('records the reminder even when manager LINE delivery is unavailable',async()=>{
 await runHumanSupportFinalReminders(new Date('2026-10-30T04:00:00Z'));
 expect(m.record).toHaveBeenCalledWith(expect.anything(),{storeId:'a',eventKey:'human-support-final-reminder:lead',eventType:'HUMAN_SUPPORT_FINAL_REMINDER',targetId:'lead'});
 expect(m.remove).toHaveBeenCalledWith({where:{id:'claim'}});
});
it('does not record or send when support was already assigned',async()=>{
 m.findFirst.mockResolvedValue(null);await runHumanSupportFinalReminders();
 expect(m.record).not.toHaveBeenCalled();expect(m.notify).not.toHaveBeenCalled();
});
