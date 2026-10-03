import { beforeEach,expect,it,vi } from 'vitest';
import { coachNoticeFlex,coachNoticeSettingId } from '@/lib/course-coach-notifications';
const m=vi.hoisted(()=>({query:vi.fn(),execute:vi.fn(),template:vi.fn(),feature:vi.fn(),preview:vi.fn(),send:vi.fn(),sessions:vi.fn(),session:vi.fn(),link:vi.fn(),member:vi.fn(),customer:vi.fn(),central:vi.fn(),route:vi.fn(),store:vi.fn(),tx:vi.fn(),usage:vi.fn(),upsert:vi.fn(),update:vi.fn(),limit:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$queryRaw:m.query,$executeRaw:m.execute,messageTemplate:{findFirst:m.template},staffMemberLink:{findFirst:m.link},customer:{findFirst:m.customer},store:{findUniqueOrThrow:m.store},$transaction:m.tx,messageLog:{update:m.update,updateMany:m.update}}}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{courseSession:{findMany:m.sessions,findFirst:m.session}}}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.feature}));
vi.mock('@/lib/runtime-env',()=>({isPreviewExternalIntegrationBlocked:m.preview}));
vi.mock('@/lib/line',()=>({pushMessage:m.send,pushSteamButlerMessage:m.send}));
vi.mock('@/lib/store-plan',()=>({getStoreForPlanByStoreId:vi.fn().mockResolvedValue({})}));
vi.mock('@/server/services/central-member-resolver',()=>({resolveCentralMemberCustomerForStore:m.member}));
vi.mock('@/server/services/central-line-recipient-loader',()=>({resolveCentralLineRecipientForCustomer:m.central}));
vi.mock('@/server/services/verified-reminder-line-route',()=>({resolveVerifiedReminderLineRoute:m.route}));
vi.mock('@/lib/usage-gate',()=>({checkReminderSendLimit:m.limit}));
import { enqueueCoachDigests,runCoachNotifications } from '@/server/services/course-coach-notifications';
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue(1);m.feature.mockResolvedValue(true);m.template.mockResolvedValue({id:'enabled'});m.preview.mockReturnValue(true);});
it('keeps coach switches independent and store scoped',()=>{
 expect(coachNoticeSettingId('a','DIGEST')).not.toBe(coachNoticeSettingId('a','CHANGE'));
 expect(coachNoticeSettingId('a','TRIAL')).not.toBe(coachNoticeSettingId('b','TRIAL'));
});
it('builds a compact Flex with a latest-roster link and no private customer details',()=>{
 const line={name:'肌力',startsAt:'2026-10-03T01:00:00Z',endsAt:'2026-10-03T02:00:00Z',room:'A 空間',color:'#40986F',detail:'體驗 2 位'};
 const message=coachNoticeFlex('DIGEST','店家',Array.from({length:10},()=>line),'https://example.com/book?view=work','2026-10-03');
 expect(message.type).toBe('flex');expect(message.altText).toContain('10 筆');
 const json=JSON.stringify(message);expect(json).toContain('另 2 筆');expect(json).toContain('2026-10-03 09:00');expect(json).toContain('view=work');expect(json).toContain('體驗 2 位');
});
it('does not scan or enqueue a digest before Taipei 21:00',async()=>{
 expect(await enqueueCoachDigests(new Date('2026-10-02T12:59:00Z'))).toBe(0);
 expect(m.sessions).not.toHaveBeenCalled();
});
it('queues tomorrow only and one digest per coach at Taipei 21:00',async()=>{
 m.sessions.mockResolvedValue([{id:'1',storeId:'a',coachId:'x'},{id:'2',storeId:'a',coachId:'x'},{id:'3',storeId:'a',coachId:'y'}]);
 expect(await enqueueCoachDigests(new Date('2026-10-02T13:00:00Z'))).toBe(2);
 expect(m.sessions.mock.calls[0][0].where.startsAt).toEqual({gte:new Date('2026-10-02T16:00:00Z'),lte:new Date('2026-10-03T15:59:59.999Z')});
 expect(m.execute).toHaveBeenCalledTimes(2);
 expect(m.execute.mock.calls[0].join(' ')).toContain('2026-10-03');
});
it('does not queue empty summaries or disabled notifications',async()=>{
 m.sessions.mockResolvedValue([]);expect(await enqueueCoachDigests(new Date('2026-10-02T13:00:00Z'))).toBe(0);
 m.sessions.mockResolvedValue([{id:'1',storeId:'a',coachId:'x'}]);m.template.mockResolvedValue(null);
 expect(await enqueueCoachDigests(new Date('2026-10-02T13:00:00Z'))).toBe(0);expect(m.execute).not.toHaveBeenCalled();
});
it('Preview records a skip without resolving real recipients or sending LINE',async()=>{
 m.query.mockResolvedValue([{id:'event',storeId:'a',staffId:'x',kind:'TRIAL',createdAt:new Date(),payload:{},retryKey:'same-uuid'}]);
 expect(await runCoachNotifications('a')).toEqual({sent:0,skipped:1,failed:0});
 expect(m.execute.mock.calls[0]).toContain('SKIPPED');expect(m.send).not.toHaveBeenCalled();
 expect(m.query.mock.calls[0]).toContain('a');
});
it('turning off a queued type prevents sending',async()=>{
 m.query.mockResolvedValue([{id:'event',storeId:'a',staffId:'x',kind:'CHANGE',createdAt:new Date(),payload:{}}]);m.template.mockResolvedValue(null);m.preview.mockReturnValue(false);
 expect((await runCoachNotifications('a')).skipped).toBe(1);expect(m.send).not.toHaveBeenCalled();
});

function readyDelivery(){
 m.preview.mockReturnValue(false);m.link.mockResolvedValue({userId:'coach-user'});m.member.mockResolvedValue({customerId:'coach-customer'});
 m.customer.mockResolvedValue({id:'coach-customer',lineLinkStatus:'LINKED',lineUserId:'line-coach'});
 m.central.mockResolvedValue({centralUserId:'coach-user',deliverable:true,recipientLineUserId:'line-coach'});
 m.route.mockResolvedValue({status:'READY',channel:'CENTRAL',recipientLineUserId:'line-coach'});
 m.store.mockResolvedValue({name:'店',slug:'store'});m.limit.mockReturnValue({allowed:true});m.usage.mockResolvedValue(0);
 m.tx.mockImplementation(fn=>fn({$queryRaw:vi.fn(),$executeRaw:m.execute,messageTemplate:{findFirst:m.template},messageLog:{count:m.usage,upsert:m.upsert}}));
 const message=coachNoticeFlex('DIGEST','店',[{name:'課',startsAt:'2026-10-03T01:00:00Z',endsAt:'2026-10-03T02:00:00Z',room:'A',color:'#40986F',detail:'體驗 1 位'}],'https://example.com');
 const target={userId:'coach-user',customerId:'coach-customer',channel:'CENTRAL',recipient:'line-coach'};
 const notice={id:'event',storeId:'a',staffId:'x',kind:'DIGEST',createdAt:new Date(),firstAttemptAt:new Date(),retryKey:'persistent-retry-uuid',payload:{},message,recipient:target};
 m.query.mockResolvedValue([notice]);m.send.mockResolvedValue({success:true});return {notice,target,message};
}
it('uses the persisted retry UUID, recipient and Flex message on retry',async()=>{
 const {message}=readyDelivery();expect((await runCoachNotifications('a')).sent).toBe(1);
 expect(m.send).toHaveBeenCalledWith('line-coach',[message],'persistent-retry-uuid');expect(m.session).not.toHaveBeenCalled();
});
it('never sends after a coach binding changes',async()=>{
 readyDelivery();m.link.mockResolvedValue({userId:'different-user'});
 expect((await runCoachNotifications('a')).skipped).toBe(1);expect(m.send).not.toHaveBeenCalled();
});
it('rechecks binding after the quota claim and before external delivery',async()=>{
 readyDelivery();m.link.mockResolvedValueOnce({userId:'coach-user'}).mockResolvedValueOnce(null);
 expect((await runCoachNotifications('a')).skipped).toBe(1);expect(m.send).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'SKIPPED'})}));
});
it('records unbound recipients without sending',async()=>{
 readyDelivery();m.link.mockResolvedValue(null);
 expect((await runCoachNotifications('a')).skipped).toBe(1);expect(m.send).not.toHaveBeenCalled();
});
it('respects the shared monthly notification quota',async()=>{
 readyDelivery();m.limit.mockReturnValue({allowed:false});expect((await runCoachNotifications('a')).failed).toBe(1);expect(m.send).not.toHaveBeenCalled();
});
it('blocks retries beyond the LINE idempotency window',async()=>{
 const {notice}=readyDelivery();m.query.mockResolvedValue([{...notice,firstAttemptAt:new Date(Date.now()-24*3600000)}]);
 expect((await runCoachNotifications('a')).skipped).toBe(1);expect(m.send).not.toHaveBeenCalled();
});
it('records delivery failures for retry and retains the same retry key',async()=>{
 readyDelivery();m.send.mockResolvedValue({success:false,httpStatus:500});expect((await runCoachNotifications('a')).failed).toBe(1);
 expect(m.execute.mock.calls.some(call=>call.includes('FAILED'))).toBe(true);expect(m.send.mock.calls[0][2]).toBe('persistent-retry-uuid');
});
