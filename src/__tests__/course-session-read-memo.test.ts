import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),raw:vi.fn(),first:vi.fn(),templates:vi.fn(),mode:vi.fn(),available:vi.fn(),ready:vi.fn()}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{courseSession:{findFirst:m.session},courseTemplate:{findFirst:m.first,findMany:m.templates},courseBookingRule:{findUnique:m.mode},$queryRaw:m.raw}}));
vi.mock('@/lib/sports-native-preview',()=>({sportsNativePreview:async()=>true}));
vi.mock('@/server/services/sports-production-readiness',()=>({sportsRulesAvailable:m.available,assertSportsProductionReady:m.ready}));
import {coursePrisma} from '@/lib/course-db';
import {withReadRequestMemo} from '@/server/services/read-request-memo';
import {readCourseSessionDetail} from '@/server/queries/course-session-detail';
import {readSportsSessionRule} from '@/server/services/sports-staging-schedule';
import {sessionWaitlistPolicy} from '@/server/services/sports-session-waitlist';
import {readSportsTeachingTemplates} from '@/server/services/sports-teaching-templates';
import {musicItemTemplateIds} from '@/server/services/music-item-compatibility';
const payload={frequency:'WEEKLY',enrollment:'OPEN',planId:null,students:[],trialPrice:0,waitlist:{limit:3,stopMinutes:60}};
const fallback={waitlistEnabled:false,waitlistLimit:0,waitlistStopMinutes:240};
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({id:'session'});m.raw.mockResolvedValue([{...payload,payload}]);m.first.mockResolvedValue({musicSubjectId:'dance',classType:'GROUP',musicTrialMode:null});m.templates.mockResolvedValue([{id:'current'},{id:'old'}]);m.mode.mockResolvedValue({selfBookingEnabled:true});m.available.mockResolvedValue(true);m.ready.mockResolvedValue(undefined);});
it('shares session and template metadata only inside one current request',async()=>{
 await withReadRequestMemo(()=>Promise.all([readCourseSessionDetail('store','session'),readCourseSessionDetail('store','session'),musicItemTemplateIds(coursePrisma,'store','current'),musicItemTemplateIds(coursePrisma,'store','current'),readSportsTeachingTemplates(coursePrisma,'store','dance'),readSportsTeachingTemplates(coursePrisma,'store','dance')]));
 expect(m.session).toHaveBeenCalledTimes(1);expect(m.first).toHaveBeenCalledTimes(1);expect(m.templates).toHaveBeenCalledTimes(2);
 await withReadRequestMemo(()=>readCourseSessionDetail('store','session'));expect(m.session).toHaveBeenCalledTimes(2);
});
it('shares persisted rule evidence with waitlist without omitting readiness or self-booking policy',async()=>{
 await withReadRequestMemo(async()=>{
  const [rule,policy]=await Promise.all([readSportsSessionRule(coursePrisma,'store','session'),sessionWaitlistPolicy(coursePrisma,'store','session',fallback),readSportsSessionRule(coursePrisma,'store','session')]);
  expect(rule?.enrollment).toBe('OPEN');expect(policy).toEqual({waitlistEnabled:true,waitlistLimit:3,waitlistStopMinutes:60});
 });
 expect(m.raw).toHaveBeenCalledTimes(1);expect(m.available).toHaveBeenCalledTimes(1);expect(m.ready).toHaveBeenCalledTimes(1);expect(m.mode).toHaveBeenCalledTimes(1);
 m.mode.mockResolvedValue({selfBookingEnabled:false});expect(await withReadRequestMemo(()=>sessionWaitlistPolicy(coursePrisma,'store','session',fallback))).toEqual(fallback);
});
it('keeps different stores and sessions independent',async()=>{
 await withReadRequestMemo(()=>Promise.all([readCourseSessionDetail('one','session'),readCourseSessionDetail('two','session'),readCourseSessionDetail('one','other')]));expect(m.session).toHaveBeenCalledTimes(3);
 expect(m.session.mock.calls.map(([args])=>args.where)).toEqual([{id:'session',storeId:'one'},{id:'session',storeId:'two'},{id:'other',storeId:'one'}]);
});
it('never reuses transaction metadata, even within an HTTP read',async()=>{
 const tx={courseTemplate:{findFirst:m.first,findMany:m.templates},$queryRaw:m.raw} as unknown as Parameters<typeof readSportsSessionRule>[0]&Parameters<typeof musicItemTemplateIds>[0];
 await withReadRequestMemo(async()=>{await readSportsSessionRule(tx,'store','session');await readSportsSessionRule(tx,'store','session');await musicItemTemplateIds(tx,'store','current');await musicItemTemplateIds(tx,'store','current')});
 expect(m.raw).toHaveBeenCalledTimes(2);expect(m.ready).toHaveBeenCalledTimes(2);expect(m.first).toHaveBeenCalledTimes(2);
});
it('does not suppress readiness failures or carry failed reads into a later request',async()=>{
 m.ready.mockRejectedValueOnce(new Error('not ready'));await expect(withReadRequestMemo(()=>readSportsSessionRule(coursePrisma,'store','session'))).rejects.toThrow('not ready');expect(m.raw).not.toHaveBeenCalled();
 expect(await withReadRequestMemo(()=>readSportsSessionRule(coursePrisma,'store','session'))).not.toBeNull();expect(m.raw).toHaveBeenCalledTimes(1);
});
it('does fresh reads outside an explicit HTTP read scope',async()=>{
 await readSportsSessionRule(coursePrisma,'store','session');await readSportsSessionRule(coursePrisma,'store','session');expect(m.raw).toHaveBeenCalledTimes(2);expect(m.ready).toHaveBeenCalledTimes(2);
});
