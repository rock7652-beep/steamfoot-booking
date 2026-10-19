import type { ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ user: vi.fn(), store: vi.fn(), permission: vi.fn(), enabled: vi.fn(), load: vi.fn(), sessions: vi.fn(), context: vi.fn() }));
vi.mock('@/lib/session', () => ({ getCurrentUser: m.user }));
vi.mock('@/lib/store', () => ({ getActiveStoreForRead: m.store }));
vi.mock('@/lib/permissions', () => ({ checkPermission: m.permission }));
vi.mock('@/lib/sports-staging', () => ({ sportsProductionEnabled: m.enabled }));
vi.mock('@/server/actions/sports-staging', () => ({ loadSportsStaging: m.load }));
vi.mock('@/lib/industry-module-server', () => ({ getStoreIndustryModule: async () => 'course' }));
vi.mock('@/lib/feature-gate', () => ({ requireStoreFeature: async () => {}, hasStoreFeature: async () => false }));
vi.mock('@/lib/store-view-context-server', () => ({ resolveStoreViewContextFromCookie: m.context }));
vi.mock('@/lib/db', () => ({ prisma: { storeFeatureEntitlement: { findMany: async () => [{ featureKey: 'business.fitness' }] }, customer: { findMany: async () => [] }, staff: { findMany: async () => [] }, businessHours: { findMany: async () => [] }, specialBusinessDay: { findMany: async () => [] }, $queryRaw: async () => [], store: { findUnique: async () => ({ name: '運動店' }) } } }));
vi.mock('@/lib/course-db', () => ({ coursePrisma: { courseRental: { findMany: async () => [] }, courseBooking: { findMany: async () => [] }, courseRoom: { findMany: async () => [] }, courseTemplate: { findMany: async () => [] }, courseSession: { findMany: m.sessions }, coursePointPlan: { findMany: async () => [] } } }));
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
 vi.clearAllMocks();
 m.user.mockResolvedValue({ id: 'owner', role: 'OWNER', staffId: 'staff', storeId: 'parent' });
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
it.each(['OWNER', 'ADMIN'])('keeps the enabled writable %s sports entry', async role => {
 m.user.mockResolvedValue({ id: 'operator', role, staffId: 'staff', storeId: role === 'OWNER' ? 'child' : null });
 m.context.mockResolvedValue(null); m.load.mockResolvedValue({ success: true, data: { lessons: [] } });
 const page = await CoursesPage({ searchParams: Promise.resolve({}) });
 expect(find(page, 'sports-workspace')?.props).toMatchObject({ production: true, storeName: '運動店' });
 expect(m.load).toHaveBeenCalledTimes(1); expect(m.sessions).not.toHaveBeenCalled();
});
it('keeps staff without the required permissions on the existing schedule', async () => {
 m.user.mockResolvedValue({ id: 'staff', role: 'STAFF', staffId: 'staff', storeId: 'child' });
 m.permission.mockImplementation(async (_role, _staff, permission) => permission !== 'plans.edit');
 m.context.mockResolvedValue(null);
 expect(find(await CoursesPage({ searchParams: Promise.resolve({}) }), 'legacy-workspace')).toBeDefined();
 expect(m.load).not.toHaveBeenCalled();
});
it('does not bypass backend refusal for a writable store', async () => {
 m.store.mockResolvedValue('parent'); m.context.mockResolvedValue(null);
 const page = await CoursesPage({ searchParams: Promise.resolve({}) });
 expect(page.props).toMatchObject({ role: 'alert', children: '子店查看模式僅供查閱，不可執行操作' });
 expect(m.load).toHaveBeenCalledTimes(1); expect(m.sessions).not.toHaveBeenCalled();
});
