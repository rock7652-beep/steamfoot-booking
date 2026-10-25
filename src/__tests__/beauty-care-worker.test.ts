vi.mock("@/server/beauty/notification-worker-context",()=>({beautyWorkerLineAllowed:vi.fn(async()=>true)}));
import {PGlite} from "@electric-sql/pglite";
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {defaultTrialCareRules} from '@/lib/trial-care';
const m=vi.hoisted(()=>({blocked:vi.fn(),stores:vi.fn(),feature:vi.fn(),plans:vi.fn(),cards:vi.fn(),plan:vi.fn(),card:vi.fn(),count:vi.fn(),purchased:vi.fn(),pending:vi.fn(),trials:vi.fn(),booking:vi.fn(),care:vi.fn(),transaction:vi.fn(),query:vi.fn(),person:vi.fn(),pref:vi.fn(),planPref:vi.fn(),existing:vi.fn(),messageCreate:vi.fn(),failure:vi.fn(),template:vi.fn(),careExisting:vi.fn(),careCount:vi.fn(),careCreate:vi.fn(),careUpdate:vi.fn(),send:vi.fn(),ledger:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{store:{findMany:m.stores},trialCareSetting:{findUnique:m.care},messageLog:{upsert:m.failure},$transaction:m.transaction}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{beautyLedger:{findFirst:m.ledger},beautyPlan:{findMany:m.plans,findFirst:m.plan},beautyCard:{findMany:m.cards,findFirst:m.card,count:m.purchased},beautyAppointment:{count:m.count,findFirst:m.booking},beautyPurchase:{count:m.pending},$queryRaw:m.trials}}));
vi.mock('@/lib/runtime-env',()=>({isPreviewExternalIntegrationBlocked:m.blocked,isPreview:()=>false,isProduction:()=>true}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.feature}));vi.mock('@/server/services/course-card-notification-delivery',()=>({deliverCourseCardNotification:m.send}));
import {runBeautyCareReminders} from '@/server/beauty/care-reminders';
const now=new Date('2026-10-22T02:00Z'),person={id:'member',name:'家人',lineUserId:'line',lineLinkStatus:'LINKED'};
const card={id:'card',storeId:'store',planId:'plan',customerId:'buyer',memberIds:['member'],name:'十次方案',remaining:2,expiresAt:new Date('2026-12-01'),closedAt:null};
const plan={id:'plan',storeId:'store',active:true,lowBalanceEnabled:true,lowBalanceThreshold:2,expiryReminder:{enabled:false,days:[14,7]}};
const setting={enabled:true,activatedAt:new Date('2026-10-20T00:00Z'),updatedAt:new Date('2026-10-20T00:00Z'),rules:defaultTrialCareRules()};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('BEAUTY_MODULE_ENABLED','1');vi.stubEnv('BEAUTY_NOTIFICATIONS_ENABLED','1');vi.stubEnv('NEXTAUTH_URL','https://qa.invalid');m.blocked.mockReturnValue(false);m.feature.mockResolvedValue(true);m.stores.mockResolvedValue([{id:'store',name:'美業店',slug:'beauty'}]);m.plans.mockResolvedValue([plan]);m.cards.mockResolvedValue([card]);m.plan.mockResolvedValue(plan);m.card.mockResolvedValue(card);m.count.mockResolvedValue(0);m.purchased.mockResolvedValue(0);m.pending.mockResolvedValue(0);m.trials.mockResolvedValue([]);m.booking.mockResolvedValue({id:'trial'});m.care.mockResolvedValue(null);m.query.mockResolvedValue([{id:'store'}]);m.person.mockResolvedValue(person);m.pref.mockResolvedValue(null);m.planPref.mockResolvedValue(null);m.existing.mockResolvedValue(null);m.careExisting.mockResolvedValue(null);m.careCount.mockResolvedValue(0);m.failure.mockResolvedValue({});m.send.mockResolvedValue('SENT');m.transaction.mockImplementation(work=>work({$queryRaw:m.query,customer:{findFirst:m.person},trialCareSetting:{findUnique:m.care},trialCarePreference:{findUnique:m.pref},messageTemplate:{findFirst:m.planPref,upsert:m.template},messageLog:{findFirst:m.existing,create:m.messageCreate},trialCareLog:{findUnique:m.careExisting,count:m.careCount,create:m.careCreate,update:m.careUpdate}}));});
afterEach(()=>vi.unstubAllEnvs());
it.each(['off','preview','module'])('returns before any read/write/transport when %s is blocked',async mode=>{if(mode==='off')vi.stubEnv('BEAUTY_NOTIFICATIONS_ENABLED','0');if(mode==='module')vi.stubEnv('BEAUTY_MODULE_ENABLED','0');if(mode==='preview')m.blocked.mockReturnValue(true);expect(await runBeautyCareReminders(now)).toEqual({sent:0,skipped:0,failed:0});expect(m.stores).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();});
it('uses only Beauty cards and current member identity through shared verified transport',async()=>{expect(await runBeautyCareReminders(now)).toMatchObject({sent:1});expect(m.send.mock.calls[0][1]).toMatchObject({storeId:'store',person:{id:'member'}});expect(m.card.mock.calls[0][0].where).toEqual({id:'card',storeId:'store',memberIds:{has:'member'}});expect(m.messageCreate.mock.calls[0][0].data).not.toHaveProperty('courseCardId');});
it('rechecks withdrawn shared members while holding the same store lock',async()=>{m.card.mockResolvedValue(null);expect(await runBeautyCareReminders(now)).toMatchObject({sent:0,skipped:1});expect(m.send).not.toHaveBeenCalled();});
it('rechecks expired/refunded cards and inactive plans before sending',async()=>{m.card.mockResolvedValue({...card,closedAt:now});await runBeautyCareReminders(now);expect(m.send).not.toHaveBeenCalled();});
it('checks current opt-out and membership independently for each shared member',async()=>{m.planPref.mockResolvedValue({body:'stopped'});await runBeautyCareReminders(now);expect(m.send).not.toHaveBeenCalled();expect(m.messageCreate).not.toHaveBeenCalled();});
it('does not repeat sent/failed/uncertain receipts on later cron runs',async()=>{m.existing.mockResolvedValue({status:'FAILED'});await runBeautyCareReminders(now);expect(m.send).not.toHaveBeenCalled();});
it('records a transport/transaction uncertainty without inventing a success',async()=>{m.send.mockRejectedValue(new Error('uncertain'));expect(await runBeautyCareReminders(now)).toMatchObject({failed:1,sent:0});expect(m.failure).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({storeId:'store',customerId:'member',status:'FAILED'}),update:{}}));});
it('stops before reading cards if the store LINE entitlement is absent',async()=>{m.feature.mockResolvedValue(false);await runBeautyCareReminders(now);expect(m.plans).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();});
function trial(){m.plans.mockResolvedValue([]);m.care.mockResolvedValue(setting);m.trials.mockResolvedValue([{id:'trial',customerId:'member',completedAt:new Date('2026-10-21T00:00Z')}]);}
it('enrolls only first-completion markers after activation and writes BEAUTY care logs',async()=>{trial();expect(await runBeautyCareReminders(now)).toMatchObject({sent:1});const sql=m.trials.mock.calls[0][0];expect(sql.join('')).toContain("e.kind='TRIAL_CARE_COMPLETED'");expect(sql.join('')).toContain('b."endsAt"<=');expect(m.careCreate.mock.calls[0][0].data).toMatchObject({module:'BEAUTY',bookingId:'trial',customerId:'member',stage:0});});
it('does not send or create a care journey for historical/unmarked completions',async()=>{trial();m.trials.mockResolvedValue([]);await runBeautyCareReminders(now);expect(m.send).not.toHaveBeenCalled();expect(m.careCreate).not.toHaveBeenCalled();});
it('a cancelled/restored trial cannot send after candidate selection',async()=>{trial();m.booking.mockResolvedValue(null);await runBeautyCareReminders(now);expect(m.send).not.toHaveBeenCalled();});
it('customer opt-out wins over store care settings',async()=>{trial();m.pref.mockResolvedValue({stoppedAt:now});await runBeautyCareReminders(now);expect(m.send).not.toHaveBeenCalled();expect(m.careCreate.mock.calls[0][0].data.reason).toBe('顧客已停止接收');});
it('changed or disabled care settings invalidate a selected candidate',async()=>{trial();m.care.mockResolvedValueOnce(setting).mockResolvedValue({...setting,enabled:false});await runBeautyCareReminders(now);expect(m.send).not.toHaveBeenCalled();expect(m.careCreate).not.toHaveBeenCalled();});
it.each(['purchased','pending','booked'])('skips later invitations for %s without suppressing the first care message rule',async reason=>{trial();const rules=defaultTrialCareRules();rules[0].enabled=false;m.care.mockResolvedValue({...setting,rules});m.trials.mockResolvedValue([{id:'trial',customerId:'member',completedAt:new Date('2026-10-18T00:00Z')}]);if(reason==='purchased')m.purchased.mockResolvedValue(1);if(reason==='pending')m.pending.mockResolvedValue(1);if(reason==='booked')m.count.mockResolvedValue(1);await runBeautyCareReminders(now);expect(m.send).not.toHaveBeenCalled();expect(m.careCreate.mock.calls.map(c=>c[0].data.reason)).toContain(reason==='purchased'?'已購買方案或儲值':reason==='pending'?'購買申請待核帳，略過本次邀請':'已預約下次到店');});
it('never repeats a completed/skipped care stage or another trial in the same journey',async()=>{trial();m.careExisting.mockResolvedValue({status:'SENT'});await runBeautyCareReminders(now);expect(m.send).not.toHaveBeenCalled();expect(m.careCreate).not.toHaveBeenCalled();});

it('actual enrollment SQL includes a newly completed overnight trial and excludes historic restorations/guests/future/cancelled/foreign rows',async()=>{
 trial();await runBeautyCareReminders(now);
 const [parts,...values]=m.trials.mock.calls[0];const sql=parts.reduce((text:string,part:string,i:number)=>text+(i?'$'+i:'')+part,'');
 const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE "BeautyEvent" (id text,"storeId" text,kind text,status text,"appointmentId" text,"createdAt" timestamptz);
  CREATE TABLE "BeautyAppointment" (id text,"storeId" text,"customerId" text,"isTrial" boolean,status text,"startsAt" timestamptz,"endsAt" timestamptz);
  INSERT INTO "BeautyAppointment" VALUES
  ('overnight','store','member',true,'COMPLETED','2026-10-19T15:00Z','2026-10-20T00:00Z'),
  ('old','store','member',true,'COMPLETED','2026-10-18T15:00Z','2026-10-19T00:00Z'),
  ('guest','store',NULL,true,'COMPLETED','2026-10-20T15:00Z','2026-10-21T00:00Z'),
  ('future','store','member',true,'COMPLETED','2026-10-24T15:00Z','2026-10-25T00:00Z'),
  ('cancel','store','member',true,'CANCELLED','2026-10-20T15:00Z','2026-10-21T00:00Z'),
  ('foreign','other','member',true,'COMPLETED','2026-10-20T15:00Z','2026-10-21T00:00Z');
  INSERT INTO "BeautyEvent" SELECT id,'store','TRIAL_CARE_COMPLETED','AUDIT',id,'2026-10-21T01:00Z' FROM "BeautyAppointment" WHERE "storeId"='store';
  INSERT INTO "BeautyEvent" VALUES ('old-complete','store','COMPLETED','SKIPPED','old','2026-10-19T01:00Z'),('foreign-marker','other','TRIAL_CARE_COMPLETED','AUDIT','foreign','2026-10-21T01:00Z');`);
  const result=await db.query<{id:string}>(sql,values.map((v:unknown)=>v instanceof Date?v.toISOString():v));expect(result.rows.map(r=>r.id)).toEqual(['overnight']);
 }finally{await db.close();}
});

it('does not enroll existing low balances merely by enabling global LINE',async()=>{
 vi.stubEnv('BEAUTY_NOTIFICATIONS_ACTIVATED_AT','2026-10-21T00:00:00.000Z');m.ledger.mockResolvedValue(null);
 await runBeautyCareReminders(now);expect(m.send).not.toHaveBeenCalled();expect(m.ledger).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:'store',cardId:'card',createdAt:{gte:new Date('2026-10-21T00:00Z')}})}));
});
it('enrolls an existing card after a new post-activation ledger event',async()=>{
 vi.stubEnv('BEAUTY_NOTIFICATIONS_ACTIVATED_AT','2026-10-21T00:00:00.000Z');m.ledger.mockResolvedValue({id:'fresh-use'});
 expect(await runBeautyCareReminders(now)).toMatchObject({sent:1});
});
it('does not backfill pre-activation completed trials',async()=>{
 trial();vi.stubEnv('BEAUTY_NOTIFICATIONS_ACTIVATED_AT','2026-10-22T01:00:00.000Z');
 await runBeautyCareReminders(now);expect(m.send).not.toHaveBeenCalled();expect(m.trials.mock.calls[0].slice(1)).toContainEqual(new Date('2026-10-22T01:00Z'));
});
