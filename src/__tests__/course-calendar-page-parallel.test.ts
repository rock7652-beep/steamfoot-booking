import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({user:vi.fn(),store:vi.fn(),can:vi.fn(),feature:vi.fn(),view:vi.fn(),rentals:vi.fn(),customers:vi.fn(),sessions:vi.fn(),bookings:vi.fn(),rosters:vi.fn(),labels:vi.fn(),plans:vi.fn(),modes:vi.fn(),orders:vi.fn(),many:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:()=>{throw Error('REDIRECT');}}));
vi.mock('@/lib/session',()=>({getCurrentUser:m.user}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:m.store}));
vi.mock('@/lib/permissions',()=>({checkPermission:m.can}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature,hasStoreFeature:async()=>false}));
vi.mock('@/lib/industry-module-server',()=>({getStoreIndustryModule:async()=> 'course'}));
vi.mock('@/lib/store-view-context-server',()=>({resolveStoreViewContextFromCookie:m.view}));
vi.mock('@/lib/sports-native-preview',()=>({sportsNativePreview:async()=>false}));
vi.mock('@/server/services/course-calendar-rosters',()=>({preloadCourseCalendarRosters:m.rosters}));
vi.mock('@/server/services/customer-label-snapshot',()=>({customerLabelSnapshot:m.labels}));
vi.mock('@/server/services/course-display-order',()=>({readCourseOrders:m.orders}));
vi.mock('@/server/services/music-data-scope',()=>({musicSessionWhere:()=>({}),musicDataScope:()=>undefined}));
vi.mock('@/lib/course-purchase-intent-flag',()=>({coursePurchaseIntentsEnabled:()=>false}));
vi.mock('@/lib/db',()=>({prisma:{storeFeatureEntitlement:{findMany:async()=>[{featureKey:'business.music'}]},customer:{findMany:m.customers},staff:{findMany:m.many},businessHours:{findMany:m.many},specialBusinessDay:{findMany:m.many},$queryRaw:m.many}}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{courseRental:{findMany:m.rentals},courseBooking:{findMany:m.bookings},courseRoom:{findMany:m.many},courseTemplate:{findMany:m.many},courseSession:{findMany:m.sessions,groupBy:m.many},coursePointPlan:{findMany:m.plans},courseBookingRule:{findUnique:m.modes}}}));
vi.mock('@/components/desktop',()=>({PageShell:()=>null,PageHeader:()=>null}));
vi.mock('@/components/customer-labels',()=>({CustomerLabelsSeed:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/courses/workspace',()=>({CourseWorkspace:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/courses/rooms-page',()=>({CourseRoomsPage:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/courses/music-subject-catalog',()=>({MusicSubjectCatalog:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/courses/analytics-page',()=>({CourseAnalyticsPage:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/courses/member-page',()=>({CourseMemberPage:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/courses/shared-hub',()=>({CourseSharedHub:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/courses/showcase/music-types-showcase',()=>({MusicTypesShowcase:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/cashbook/_components/cashbook-shortcut',()=>({CashbookShortcut:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/courses/purchase-recovery',()=>({CoursePurchaseIntentProvider:()=>null}));
import CoursesPage from '@/app/(dashboard)/dashboard/courses/page';
const snapshot={storeId:'store',details:{a:{roster:[{id:'trial'},{id:'10-lessons'},{id:'20-lessons'}]}}};
beforeEach(()=>{
 vi.clearAllMocks();m.user.mockResolvedValue({id:'u',storeId:'store',role:'OWNER',staffId:'s'});m.store.mockResolvedValue('store');m.can.mockResolvedValue(true);m.feature.mockResolvedValue(undefined);m.view.mockResolvedValue(null);
 for(const f of [m.rentals,m.customers,m.bookings,m.many,m.plans])f.mockResolvedValue([]);
 m.sessions.mockResolvedValue([{id:'a',nameSnapshot:'教學 A',templateId:'t',requestKey:'a',startsAt:new Date('2026-11-08T02:00:00Z'),endsAt:new Date('2026-11-08T03:00:00Z'),bookings:[]}]);
 m.modes.mockResolvedValue(null);m.orders.mockResolvedValue({});m.labels.mockResolvedValue({});m.rosters.mockResolvedValue(snapshot);
 vi.spyOn(console,'info').mockImplementation(()=>{});
});
const page=()=>CoursesPage({searchParams:Promise.resolve({date:'2026-11-08'})});
const workspace=(result:Awaited<ReturnType<typeof page>>)=>result.props.children[1].props.children[1].props.children;
it('starts calendar reads while rentals are pending and preserves all loaded data',async()=>{
 let release!:()=>void;m.rentals.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve([]);}));
 const read=page();await vi.waitFor(()=>expect(m.sessions).toHaveBeenCalledOnce());expect(m.rentals).toHaveBeenCalledOnce();release();
 const result=await read;expect(workspace(result).props.rosterSnapshots).toBe(snapshot);expect(m.user).toHaveBeenCalledOnce();expect(m.store).toHaveBeenCalledOnce();
});
it('starts complete roster preparation before labels finish and awaits both before rendering',async()=>{
 let release!:()=>void;m.labels.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve({});}));
 let done=false;const read=page().then(result=>{done=true;return result;});
 await vi.waitFor(()=>expect(m.labels).toHaveBeenCalledOnce());expect(m.rosters).toHaveBeenCalledWith('store',['a']);expect(m.plans).toHaveBeenCalledOnce();expect(m.modes).toHaveBeenCalledOnce();expect(done).toBe(false);
 release();const result=await read;expect(workspace(result).props.rosterSnapshots).toBe(snapshot);
});
it('never renders the calendar until complete roster preparation resolves',async()=>{
 let release!:()=>void;m.rosters.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve(snapshot);}));
 let done=false;const read=page().then(result=>{done=true;return result;});
 await vi.waitFor(()=>expect(m.orders).toHaveBeenCalledOnce());expect(done).toBe(false);release();await read;
});
it('fails closed before calendar reads on permission or feature rejection',async()=>{
 m.can.mockResolvedValue(false);await expect(page()).rejects.toThrow('REDIRECT');expect(m.sessions).not.toHaveBeenCalled();expect(m.rentals).not.toHaveBeenCalled();
 m.can.mockResolvedValue(true);m.feature.mockRejectedValueOnce(Error('FEATURE_DENIED'));await expect(page()).rejects.toThrow('FEATURE_DENIED');expect(m.rosters).not.toHaveBeenCalled();
});
it('retains child-store restrictions without calling the writable-store roster loader',async()=>{
 m.view.mockResolvedValue({isViewMode:true});const result=await page();expect(m.rosters).not.toHaveBeenCalled();expect(workspace(result).props).toMatchObject({canCreate:false,canEdit:false,rosterSnapshots:undefined});
});
it('propagates roster failure instead of presenting a partial calendar',async()=>{
 m.rosters.mockRejectedValueOnce(Error('complete-roster-failed'));await expect(page()).rejects.toThrow('complete-roster-failed');
});
