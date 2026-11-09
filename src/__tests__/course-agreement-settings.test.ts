import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {emptyCourseAgreement, emptyFitnessCourseAgreement, emptyBeautyAgreement, buildCourseAgreement, courseAgreementLeaveText, type CourseAgreementDraft, type CourseAgreementClause} from '@/lib/course-agreement';
const m = vi.hoisted(() => ({ raw: vi.fn(), access: vi.fn(), lock: vi.fn(), transaction: vi.fn(), find: vi.fn(), upsert: vi.fn(), update: vi.fn(), aggregate: vi.fn(), create: vi.fn(), store: vi.fn(), config: vi.fn(), rule: vi.fn() }));
vi.mock('@/lib/course-db', () => ({ coursePrisma: { $transaction: m.transaction, courseAgreementSetting: { findUnique: m.find }, courseBookingRule: { findUnique: m.rule } } }));
vi.mock('@/lib/db', () => ({ prisma: { store: { findUnique: m.store }, shopConfig: { findUnique: m.config } } }));
vi.mock('@/server/services/course-agreement-access', () => ({ requireCourseAgreementAccess: m.access }));
vi.mock('@/server/services/course-store-lock', () => ({ lockCourseStore: m.lock }));
import {courseAgreementSigningToken} from '@/server/services/course-agreement-signing-token';
import {saveCourseAgreementDraft, publishCourseAgreement, pauseCourseAgreement, readCourseAgreementSettings} from '@/server/services/course-agreement-settings';
const draft = () => ({...emptyCourseAgreement('測試店','03-0000000','測試路'), entity:'測試音樂補習班', responsible:'測試負責人',city:'新竹縣', business:'cram' as const, makeup:'提前協調補課', privacyNotice:'合成資料告知，不供正式使用'});
type StoredVersion = { id: string; storeId: string; version: number; settingsSnapshot: CourseAgreementDraft; document: CourseAgreementClause[]; createdById: string; signingTokenHash: string; documentHash: string };
type StoredSetting = { storeId: string; revision: number; draft: CourseAgreementDraft; activeVersion: StoredVersion | null; activeVersionId?: string | null };
let current: StoredSetting | null;
let versions: StoredVersion[];
beforeEach(() => {
 vi.resetAllMocks(); vi.stubEnv('COURSE_AGREEMENTS_ENABLED','1');vi.stubEnv('COURSE_AGREEMENT_LINK_SECRET','synthetic-test-secret-at-least-32-bytes'); current=null; versions=[];
 m.access.mockResolvedValue({storeId:'a',user:{id:'staff'}});m.raw.mockResolvedValue([{id:'a'}]);
 m.transaction.mockImplementation(async run => run({$queryRaw:m.raw,courseAgreementSetting:{findUnique:m.find,upsert:m.upsert,update:m.update},courseAgreementVersion:{aggregate:m.aggregate,create:m.create}}));
 m.find.mockImplementation(async()=>current);
 m.store.mockResolvedValue({name:'已設定店名'});m.config.mockResolvedValue({shopPhone:'03-0000000',address:'合成路'});m.rule.mockResolvedValue({cancellationLeadMinutes:1440});
 m.upsert.mockImplementation(async({create,update}:{create:Omit<StoredSetting,"activeVersion">;update:{draft:CourseAgreementDraft}})=>{current=current?{...current,draft:update.draft,revision:current.revision+1}:{...create,activeVersion:null};return current;});
 m.update.mockImplementation(async({data}:{data:{activeVersionId:string|null}})=>{if(!current)throw Error("missing setting");current={...current,revision:current.revision+1,activeVersionId:data.activeVersionId,activeVersion:versions.find(v=>v.id===data.activeVersionId)??null};return current;});
 m.aggregate.mockImplementation(async()=>({_max:{version:versions.length||null}}));
 m.create.mockImplementation(async({data}:{data:StoredVersion})=>{const version=structuredClone(data);versions.push(version);return version;});
});
afterEach(()=>vi.unstubAllEnvs());
it('is closed by default before authorization or data access',async()=>{vi.stubEnv('COURSE_AGREEMENTS_ENABLED','');await expect(saveCourseAgreementDraft({})).rejects.toThrow('尚未開放');expect(m.access).not.toHaveBeenCalled();expect(m.transaction).not.toHaveBeenCalled();});
it('locks the resolved store and saves a server-rendered preview',async()=>{const result=await saveCourseAgreementDraft({storeId:'a',revision:0,draft:draft()});expect(m.access).toHaveBeenCalledWith('manage','a');expect(m.lock).toHaveBeenCalledWith(expect.anything(),'a');expect(result.revision).toBe(1);expect(result.document).toEqual(buildCourseAgreement(result.draft));expect(result.documentHash).toMatch(/^[a-f0-9]{64}$/);});
it('keeps identical save retries idempotent',async()=>{const input={storeId:'a',revision:0,draft:draft()};const a=await saveCourseAgreementDraft(input);const b=await saveCourseAgreementDraft(input);expect(b).toEqual(a);expect(m.upsert).toHaveBeenCalledTimes(1);});
it('rejects stale edits rather than replacing the new draft',async()=>{await saveCourseAgreementDraft({storeId:'a',revision:0,draft:draft()});await expect(saveCourseAgreementDraft({storeId:'a',revision:0,draft:{...draft(),makeup:'stale'}})).rejects.toThrow('其他操作');expect(current?.draft.makeup).toBe('提前協調補課');});
it('publishes exactly the previewed content and records the author',async()=>{const p=await saveCourseAgreementDraft({storeId:'a',revision:0,draft:draft()});const result=await publishCourseAgreement({storeId:'a',revision:p.revision,documentHash:p.documentHash,acknowledged:true});expect(result.active?.version).toBe(1);expect(versions[0]).toMatchObject({storeId:'a',createdById:'staff',document:p.document,settingsSnapshot:p.draft});expect(versions[0].signingTokenHash).toMatch(/^[a-f0-9]{64}$/);});
it('returns the same version on a repeated activation request',async()=>{const p=await saveCourseAgreementDraft({storeId:'a',revision:0,draft:draft()});const input={storeId:'a',revision:p.revision,documentHash:p.documentHash,acknowledged:true};const a=await publishCourseAgreement(input);const b=await publishCourseAgreement(input);expect(b.active?.id).toBe(a.active?.id);expect(m.create).toHaveBeenCalledTimes(1);});
it('rejects a changed draft after preview',async()=>{const p=await saveCourseAgreementDraft({storeId:'a',revision:0,draft:draft()});await saveCourseAgreementDraft({storeId:'a',revision:p.revision,draft:{...draft(),makeup:'改版'}});await expect(publishCourseAgreement({storeId:'a',revision:p.revision,documentHash:p.documentHash,acknowledged:true})).rejects.toThrow('草稿已變更');expect(m.create).not.toHaveBeenCalled();});
it('requires explicit acknowledgement and completed provider data',async()=>{const p=await saveCourseAgreementDraft({storeId:'a',revision:0,draft:{...draft(),responsible:''}});await expect(publishCourseAgreement({storeId:'a',revision:p.revision,documentHash:p.documentHash,acknowledged:false})).rejects.toThrow();await expect(publishCourseAgreement({storeId:'a',revision:p.revision,documentHash:p.documentHash,acknowledged:true})).rejects.toThrow('負責人');expect(m.create).not.toHaveBeenCalled();});
it('keeps the old snapshot when a new version is published',async()=>{const p=await saveCourseAgreementDraft({storeId:'a',revision:0,draft:draft()});const a=await publishCourseAgreement({storeId:'a',revision:p.revision,documentHash:p.documentHash,acknowledged:true});const first=structuredClone(versions[0]);const p2=await saveCourseAgreementDraft({storeId:'a',revision:a.revision,draft:{...draft(),leave:{mode:'deadline',days:1,time:'21:00'}}});const b=await publishCourseAgreement({storeId:'a',revision:p2.revision,documentHash:p2.documentHash,acknowledged:true});expect(b.active?.version).toBe(2);expect(versions[0]).toEqual(first);});
it('does not write when authorization fails',async()=>{m.access.mockRejectedValue(new Error('wrong store'));await expect(saveCourseAgreementDraft({storeId:'b',revision:0,draft:draft()})).rejects.toThrow('wrong store');expect(m.transaction).not.toHaveBeenCalled();});
it('supports all three leave modes without false elapsed-review statements',()=>{
 expect(courseAgreementLeaveText({mode:'hours',hours:24})).toContain('24 小時');
 expect(courseAgreementLeaveText({mode:'deadline',days:1,time:'21:00'})).toContain('上課前一日 21:00');
 expect(courseAgreementLeaveText({mode:'deadline',days:0,time:'21:00'})).toContain('課程開始前');
 expect(courseAgreementLeaveText({mode:'custom',rule:'自訂規則'})).toBe('自訂規則');
 expect(JSON.stringify(buildCourseAgreement(draft()))).not.toContain('審閱滿五天');
});

it('requires a durable dedicated signing key before publishing',async()=>{const p=await saveCourseAgreementDraft({storeId:'a',revision:0,draft:draft()});vi.stubEnv('COURSE_AGREEMENT_LINK_SECRET','');await expect(publishCourseAgreement({storeId:'a',revision:p.revision,documentHash:p.documentHash,acknowledged:true})).rejects.toThrow('金鑰尚未設定');expect(m.create).not.toHaveBeenCalled();});
it('reconstructs signing tokens only for the same store and version',()=>{const token=courseAgreementSigningToken('a','v1');expect(courseAgreementSigningToken('a','v1')).toBe(token);expect(courseAgreementSigningToken('b','v1')).not.toBe(token);expect(courseAgreementSigningToken('a','v2')).not.toBe(token);});

it('can pause and keep historical published versions intact',async()=>{const p=await saveCourseAgreementDraft({storeId:'a',revision:0,draft:draft()});const active=await publishCourseAgreement({storeId:'a',revision:p.revision,documentHash:p.documentHash,acknowledged:true});const history=structuredClone(versions);const result=await pauseCourseAgreement({storeId:'a',revision:active.revision,activeVersionId:active.active!.id});expect(result.active).toBeNull();expect(versions).toEqual(history);expect((await pauseCourseAgreement({storeId:'a',revision:active.revision,activeVersionId:active.active!.id})).active).toBeNull();});
it('does not pause a newer version from a stale screen',async()=>{const p=await saveCourseAgreementDraft({storeId:'a',revision:0,draft:draft()});const active=await publishCourseAgreement({storeId:'a',revision:p.revision,documentHash:p.documentHash,acknowledged:true});await expect(pauseCourseAgreement({storeId:'a',revision:0,activeVersionId:active.active!.id})).rejects.toThrow('約定書已更新');expect(current?.activeVersionId).toBe(active.active!.id);});

it('prevents fitness stores from saving or publishing the music template',async()=>{
 m.access.mockResolvedValue({storeId:'a',user:{id:'staff'},agreementProfile:'FITNESS'});
 await expect(saveCourseAgreementDraft({storeId:'a',revision:0,draft:draft()})).rejects.toThrow('模組不符');
 expect(m.upsert).not.toHaveBeenCalled();
});
it('requires service-specific risk fields before fitness activation',async()=>{
 m.access.mockResolvedValue({storeId:'a',user:{id:'staff'},agreementProfile:'FITNESS'});
 const p=await saveCourseAgreementDraft({storeId:'a',revision:0,draft:{...draft(),...emptyFitnessCourseAgreement('測試店','030000000','測試路'),entity:'測試商行',responsible:'測試負責人',city:'新竹縣',makeup:'協調補課',privacyNotice:'測試告知',business:'fitness'}});
 await expect(publishCourseAgreement({storeId:'a',revision:p.revision,documentHash:p.documentHash,acknowledged:true})).rejects.toThrow('運動強度');
 expect(m.create).not.toHaveBeenCalled();
});

it('beauty saves/publishes only through the explicit beauty scope and store lock',async()=>{
 vi.stubEnv('BEAUTY_AGREEMENTS_ENABLED','1');m.access.mockResolvedValue({storeId:'a',user:{id:'staff'},agreementProfile:'BEAUTY'});
 const d={...emptyBeautyAgreement('美業測試店','030000000','合成路'),business:'beauty' as const,entity:'測試商行',responsible:'測試者',city:'新竹縣',makeup:'雙方協調改期',privacyNotice:'測試告知',beauty:{serviceScope:'一般美容',productsAndMethods:'依當次確認',specificRisks:'敏感與刺激',precautions:'先說明必要過敏資訊',aftercare:'不適聯絡本店',emergencyProcedure:'停止服務並協助就醫',refundRule:'依法辦理'}};
 const p=await saveCourseAgreementDraft({storeId:'a',revision:0,draft:d},'BEAUTY');
 expect(m.access).toHaveBeenCalledWith('manage','a','BEAUTY');expect(m.raw).toHaveBeenCalled();expect(m.lock).not.toHaveBeenCalled();
 const published=await publishCourseAgreement({storeId:'a',revision:p.revision,documentHash:p.documentHash,acknowledged:true},'BEAUTY');expect(published.active?.version).toBe(1);expect(versions[0].document.map(c=>c.title)).toEqual(['服務共同約定','服務風險與注意事項告知']);
 m.raw.mockResolvedValue([]);await expect(pauseCourseAgreement({storeId:'a',revision:published.revision,activeVersionId:published.active!.id},'BEAUTY')).rejects.toThrow('模組已變更');
});

it('generates blank privacy notices on save and persists the exact generated notice in publication',async()=>{
 const d={...draft(),privacyNotice:''};
 const p=await saveCourseAgreementDraft({storeId:'a',revision:0,draft:d});
 expect(p.draft.privacyNoticeMode).toBe('platform');expect(p.draft.privacyNotice).toContain('日本東京');expect(p.draft.privacyNotice).toContain(d.entity);
 const same=await saveCourseAgreementDraft({storeId:'a',revision:p.revision,draft:{...p.draft,privacyNotice:'偽造平台告知'}});
 expect(same.draft.privacyNotice).toBe(p.draft.privacyNotice);expect(same.revision).toBe(p.revision);
 await publishCourseAgreement({storeId:'a',revision:p.revision,documentHash:p.documentHash,acknowledged:true});
 expect(versions[0].settingsSnapshot).toMatchObject({privacyNotice:p.draft.privacyNotice});expect(versions[0].document).toEqual(p.document);
});

it('provides a generated notice on first read without persisting a draft or changing legacy custom content',async()=>{
 const fresh=await readCourseAgreementSettings('a');
 expect(fresh.draft.privacyNoticeMode).toBe('platform');expect(fresh.draft.privacyNotice).toContain('已設定店名');expect(fresh.draft.privacyNotice).toContain('03-0000000');
 expect(m.upsert).not.toHaveBeenCalled();expect(m.transaction).not.toHaveBeenCalled();
 await saveCourseAgreementDraft({storeId:'a',revision:0,draft:draft()});m.upsert.mockClear();
 const saved=await readCourseAgreementSettings('a');expect(saved.draft.privacyNotice).toBe(draft().privacyNotice);expect(saved.draft.privacyNoticeMode).toBeUndefined();expect(m.upsert).not.toHaveBeenCalled();
});
