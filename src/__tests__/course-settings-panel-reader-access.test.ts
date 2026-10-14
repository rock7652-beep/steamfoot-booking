import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({require:vi.fn(),permission:vi.fn(),store:vi.fn(),industry:vi.fn(),view:vi.fn(),feature:vi.fn(),content:vi.fn()}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.require,checkPermission:m.permission}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:m.store}));
vi.mock('@/lib/industry-module-server',()=>({getStoreIndustryModule:m.industry}));
vi.mock('@/lib/store-view-context-server',()=>({resolveStoreViewContextFromCookie:m.view}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.feature}));
vi.mock('@/app/(dashboard)/dashboard/courses/settings-panel-content',()=>({Content:m.content}));
import {readCourseSettingsPanel} from '@/server/actions/course-settings-panel';
beforeEach(()=>{vi.resetAllMocks();m.require.mockResolvedValue({role:'OWNER',staffId:'s'});m.permission.mockResolvedValue(true);m.store.mockResolvedValue('a');m.industry.mockResolvedValue('course');m.view.mockResolvedValue(null);m.feature.mockResolvedValue(true);m.content.mockResolvedValue('content')});
it('returns only selected store content with existing destination renderer',async()=>{expect(await readCourseSettingsPanel('a','hours','tab=weekly')).toEqual({storeId:'a',panel:'hours',query:'tab=weekly',content:'content'});expect(m.require).toHaveBeenCalledWith('booking.read');expect(m.content).toHaveBeenCalledWith({panel:'hours',query:'tab=weekly'})});
it.each(['wrong-store','role','industry','invalid-panel'])('rejects %s before reading',async reason=>{if(reason==='role')m.require.mockResolvedValue({role:'STAFF'});if(reason==='industry')m.industry.mockResolvedValue('steam');await expect(readCourseSettingsPanel(reason==='wrong-store'?'b':'a',reason==='invalid-panel'?'bad':'hours','')).rejects.toThrow();expect(m.content).not.toHaveBeenCalled()});
it.each(['reminders','referral','butler'])('rejects disabled, read-only and unauthorized %s content',async panel=>{for(const failure of ['feature','view','permission']){m.feature.mockResolvedValue(failure!=='feature');m.view.mockResolvedValue(failure==='view'?{isViewMode:true}:null);m.permission.mockResolvedValue(failure!=='permission');await expect(readCourseSettingsPanel('a',panel,'')).rejects.toThrow();expect(m.content).not.toHaveBeenCalled()}});

it("keeps a destination page denial local instead of emitting Next route control flow",async()=>{m.content.mockRejectedValue(Object.assign(new Error("not found"),{digest:"NEXT_HTTP_ERROR_FALLBACK;404"}));try{await readCourseSettingsPanel("a","hours","");throw new Error("expected rejection")}catch(error){expect(error).toBeInstanceOf(Error);expect(error).not.toHaveProperty("digest");expect((error as Error).message).toContain("無權限")}});
