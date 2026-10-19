import type { ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ user: vi.fn(), store: vi.fn(), permission: vi.fn(), enabled: vi.fn(), native: vi.fn(), ensure: vi.fn(), ready: vi.fn(), profile: vi.fn(), load: vi.fn(), sessions: vi.fn(), context: vi.fn() }));
vi.mock('@/lib/session', () => ({ getCurrentUser: m.user }));
vi.mock('@/lib/store', () => ({ getActiveStoreForRead: m.store }));
vi.mock('@/lib/permissions', () => ({ checkPermission: m.permission }));
vi.mock('@/lib/sports-staging', () => ({ sportsProductionEnabled: m.enabled }));
vi.mock('@/lib/sports-native-preview', () => ({sportsNativePreview:m.native}));
vi.mock('@/server/services/sports-permanent-series', () => ({ensureSportsMonth:m.ensure}));
vi.mock('@/server/services/sports-production-readiness', () => ({assertSportsProductionReady:m.ready}));
vi.mock('@/server/actions/sports-staging', () => ({ loadSportsStaging: m.load }));
vi.mock('@/lib/industry-module-server', () => ({ getStoreIndustryModule: async () => 'course' }));
vi.mock('@/lib/feature-gate', () => ({ requireStoreFeature: async () => {}, hasStoreFeature: async () => false }));
vi.mock('@/lib/store-view-context-server', () => ({ resolveStoreViewContextFromCookie: m.context }));
vi.mock('@/lib/db', () => ({ prisma: { storeFeatureEntitlement: { findMany: m.profile }, customer: { findMany: async () => [] }, staff: { findMany: async () => [] }, businessHours: { findMany: async () => [] }, specialBusinessDay: { findMany: async () => [] }, $queryRaw: async () => [], store: { findUnique: async () => ({ name: '運動店' }) } } }));
vi.mock('@/lib/course-db', () => ({ coursePrisma: { $transaction: async (fn: (tx: object) => unknown) => fn({}), $queryRaw:async()=>[], musicSubject:{findMany:async()=>[]}, courseRental: { findMany: async () => [] }, courseBooking: { findMany: async () => [] }, courseRoom: { findMany: async () => [] }, courseTemplate: { findMany: async () => [] }, courseSession: { findMany: m.sessions }, coursePointPlan: { findMany: async () => [] } } }));
vi.mock('@/server/services/course-display-order', () => ({ readCourseOrders: async () => ({}) }));
vi.mock('@/server/services/customer-label-snapshot', () => ({ customerLabelSnapshot: async () => ({}) }));
vi.mock('@/components/admin/sports-staging-workspace', () => ({ SportsStagingWorkspace: 'sports-workspace' }));
vi.mock('@/components/desktop', () => ({ PageShell: 'page-shell', PageHeader: 'page-header' }));
vi.mock('@/components/customer-labels', () => ({ CustomerLabelsSeed: 'labels-seed' }));
vi.mock('@/app/(dashboard)/dashboard/courses/workspace', () => ({ CourseWorkspace: 'legacy-workspace' }));
vi.mock('@/app/(dashboard)/dashboard/courses/rooms-page', () => ({ CourseRoomsPage: 'rooms-page' }));
vi.mock('@/app/(dashboard)/dashboard/courses/music-subject-catalog', () => ({ MusicSubjectCatalog: 'catalog' }));
vi.mock('@/app/(dashboard)/dashboard/courses/analytics-page', () => ({ CourseAnalyticsPage: 'analytics' }));
vi.mock('@/app/(dashboard)/dashboard/courses/member-page', () => ({ CourseMemberPage: 'members' }));
vi.mock('@/app/(dashboard)/dashboard/courses/shared-hub', () => ({ CourseSharedHub: 'shared-hub' }));
vi.mock('@/app/(dashboard)/dashboard/courses/showcase/music-types-showcase', () => ({ MusicTypesShowcase: 'showcase' }));
vi.mock('@/app/(dashboard)/dashboard/courses/showcase/luby-real-day-showcase', () => ({ LubyRealDayShowcase: 'luby' }));
vi.mock('@/app/(dashboard)/dashboard/cashbook/_components/cashbook-shortcut', () => ({ CashbookShortcut: 'cashbook' }));
import CoursesPage from '@/app/(dashboard)/dashboard/courses/page';
function find(node: unknown, type: string): ReactElement<Record<string, unknown>> | undefined {
 if (!node || typeof node !== 'object') return;
 if (Array.isArray(node)) { for (const child of node) { const found = find(child, type); if (found) return found; } return; }
 const element = node as ReactElement<{ children?: unknown }>;
 if (element.type === type) return element as ReactElement<Record<string, unknown>>;
 return find(element.props?.children, type);
}
beforeEach(() => {
 vi.resetAllMocks();
 m.user.mockResolvedValue({ id: 'owner', role: 'OWNER', staffId: 'staff', storeId: 'parent' });
 m.native.mockReturnValue(true);m.profile.mockResolvedValue([{featureKey:'business.fitness'}]);
 m.store.mockResolvedValue('child'); m.permission.mockResolvedValue(true); m.enabled.mockReturnValue(true);
 m.context.mockResolvedValue({ isViewMode: true }); m.sessions.mockResolvedValue([]);
 m.load.mockResolvedValue({ success: false, error: '子店查看模式僅供查閱，不可執行操作' });
});
it('renders the selected child schedule without entering write-scoped sports loading', async () => {
 const page = await CoursesPage({ searchParams: Promise.resolve({ date: '2026-10-18' }) });
 const workspace = find(page, 'legacy-workspace');
 expect(workspace).toBeDefined(); expect(workspace!.props).toMatchObject({ storeId: 'child', canCreate: false, canEdit: false, canDelete: false });
 expect(workspace!.props.rentalPermissions).toMatchObject({ collect: false, correct: false, customerCreate: false, edit: false });
 expect(m.sessions).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: 'child' }) }));
 expect(m.load).not.toHaveBeenCalled();
});
it.each(['store-ido-xinzhuang','store-ido-banqiao'])('routes enabled own-store %s to the original schedule with native forms', async storeId => {
 m.user.mockResolvedValue({id:'operator',role:'OWNER',staffId:'staff',storeId});
 m.store.mockResolvedValue(storeId);m.context.mockResolvedValue(null);
 const data={lessons:[]};m.load.mockResolvedValue({success:true,data});
 const page=await CoursesPage({searchParams:Promise.resolve({})});
 const workspace=find(page,'legacy-workspace');
 expect(workspace?.props).toMatchObject({storeId,sportsNative:true,sportsData:data,canCreate:true,canEdit:true});
 expect(find(page,'sports-workspace')).toBeUndefined();
 expect(m.load).toHaveBeenCalledWith(true);expect(m.ensure).toHaveBeenCalledTimes(1);
 expect(m.sessions).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId})}));
});
it('keeps admin on the original schedule with native forms',async()=>{
 m.user.mockResolvedValue({id:'admin',role:'ADMIN',staffId:null,storeId:null});m.context.mockResolvedValue(null);m.load.mockResolvedValue({success:true,data:{lessons:[]}});
 const page=await CoursesPage({searchParams:Promise.resolve({})});
 expect(find(page,'legacy-workspace')?.props).toMatchObject({sportsNative:true,canCreate:true,canEdit:true});
 expect(find(page,'sports-workspace')).toBeUndefined();
});
it('keeps insufficiently privileged staff on the schedule without privileged form data',async()=>{
 m.user.mockResolvedValue({id:'staff',role:'STAFF',staffId:'staff',storeId:'child'});m.context.mockResolvedValue(null);
 m.permission.mockImplementation(async(_role,_staff,p)=>p!=='plans.edit');
 const page=await CoursesPage({searchParams:Promise.resolve({})});
 expect(find(page,'legacy-workspace')?.props).toMatchObject({sportsNative:true,sportsData:undefined});expect(m.load).not.toHaveBeenCalled();
});
it('preserves explicit read-only view mode even when store IDs match',async()=>{
 m.user.mockResolvedValue({id:'owner',role:'OWNER',staffId:'staff',storeId:'child'});m.context.mockResolvedValue({isViewMode:true});
 const page=await CoursesPage({searchParams:Promise.resolve({})});
 expect(find(page,'legacy-workspace')?.props).toMatchObject({canCreate:false,canEdit:false,canDelete:false,rentalPermissions:{edit:false,collect:false,correct:false,customerCreate:false}});
 expect(m.load).not.toHaveBeenCalled();expect(m.ensure).not.toHaveBeenCalled();
});
it.each(['store-ido-xinzhuang','store-ido-banqiao'])('routes %s catalog to the existing teaching-item list',async storeId=>{
 m.user.mockResolvedValue({id:'owner',role:'OWNER',staffId:'staff',storeId});m.store.mockResolvedValue(storeId);m.context.mockResolvedValue(null);
 const page=await CoursesPage({searchParams:Promise.resolve({view:'catalog'})});
 expect(find(page,'catalog')?.props).toMatchObject({storeId,sportsNative:true,canCreate:true,canEdit:true});
 expect(m.load).not.toHaveBeenCalled();expect(m.ensure).not.toHaveBeenCalled();expect(m.sessions).not.toHaveBeenCalled();
});
it('keeps child catalog read-only',async()=>{
 const page=await CoursesPage({searchParams:Promise.resolve({view:'catalog'})});
 expect(find(page,'catalog')?.props).toMatchObject({sportsNative:true,canCreate:false,canEdit:false});expect(m.load).not.toHaveBeenCalled();
});
it('does not activate native forms or generation when the production gate is disabled',async()=>{
 m.native.mockReturnValue(false);m.enabled.mockReturnValue(false);m.context.mockResolvedValue(null);
 const page=await CoursesPage({searchParams:Promise.resolve({})});
 expect(find(page,'legacy-workspace')?.props).toMatchObject({sportsNative:false,sportsData:undefined});expect(m.load).not.toHaveBeenCalled();expect(m.ensure).not.toHaveBeenCalled();
});
it('does not route music into the sports workspace',async()=>{
 m.profile.mockResolvedValue([{featureKey:'business.music'}]);m.enabled.mockReturnValue(false);m.context.mockResolvedValue(null);
 const page=await CoursesPage({searchParams:Promise.resolve({})});
 expect(find(page,'legacy-workspace')?.props).toMatchObject({sportsNative:false,businessProfile:'MUSIC'});expect(m.load).not.toHaveBeenCalled();expect(m.ensure).not.toHaveBeenCalled();
});
it('blocks enabled production reads if readiness fails',async()=>{
 vi.stubEnv('VERCEL_ENV','production');m.ready.mockRejectedValueOnce(new Error('not ready'));
 try{await expect(CoursesPage({searchParams:Promise.resolve({})})).rejects.toThrow('not ready');expect(m.sessions).not.toHaveBeenCalled();expect(m.load).not.toHaveBeenCalled();}finally{vi.unstubAllEnvs();}
});

it('retains historical schedule reads and passes a capacity warning to the workspace',async()=>{
 m.user.mockResolvedValue({id:'owner',role:'OWNER',staffId:'staff',storeId:'child'});m.context.mockResolvedValue(null);
 m.ensure.mockResolvedValue('固定課名單超過人數上限；既有課表仍可查看');
 const page=await CoursesPage({searchParams:Promise.resolve({date:'2027-03-01'})});
 expect(m.sessions).toHaveBeenCalled();
 expect(find(page,'legacy-workspace')?.props).toMatchObject({initialSportsCalendarWarning:'固定課名單超過人數上限；既有課表仍可查看'});
});
