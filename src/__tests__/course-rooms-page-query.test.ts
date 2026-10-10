import { createElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rooms: vi.fn(), features: vi.fn(), permission: vi.fn(), orders: vi.fn(), context: vi.fn() }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseRoom: { findMany: m.rooms } } }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findMany: m.features } } }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: m.context }));
vi.mock("@/server/services/course-display-order", () => ({ readCourseOrders: m.orders }));
vi.mock("@/components/desktop", () => ({ PageShell: ({ children }: { children: unknown }) => createElement("main", null, children as never), PageHeader: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/workspace", () => ({ CourseWorkspace: () => null }));
import { CourseRoomsPage } from "@/app/(dashboard)/dashboard/courses/rooms-page";
const user = { id: "u", role: "OWNER", staffId: "s", storeId: "store-a" } as Parameters<typeof CourseRoomsPage>[0]["user"];
beforeEach(() => { vi.clearAllMocks(); m.rooms.mockResolvedValue(Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, name: `空間 ${i}`, sessions: [] }))); m.features.mockResolvedValue([{ featureKey: "business.music" }]); m.permission.mockResolvedValue(true); m.orders.mockResolvedValue({}); m.context.mockResolvedValue(null); });
it("loads 50 rooms with bounded future-use summaries and no schedule, roster or rental queries", async () => {
  const page = await CourseRoomsPage({ storeId: "store-a", user });
  const workspace = page.props.children[1];
  expect(workspace.props.rooms).toHaveLength(50); expect(workspace.props.sessions).toEqual([]); expect(workspace.props.templates).toEqual([]);
  expect(workspace.props.staffAvailability).toEqual([]); expect(workspace.props.businessProfile).toBe("MUSIC");
  expect(m.rooms).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-a" }, select: expect.objectContaining({ sessions: expect.objectContaining({ take: 20 }) }) }));
});
it("child-store viewing cannot create, edit or delete rooms", async () => {
  m.context.mockResolvedValue({ isViewMode: true });
  const page = await CourseRoomsPage({ storeId: "store-a", user });
  expect(page.props.children[1].props).toMatchObject({ canCreate: false, canEdit: false, canDelete: false });
});
it("permission checks independently gate room creation and editing", async () => {
  m.permission.mockImplementation(async (_role, _staff, permission) => permission !== "booking.create");
  const page = await CourseRoomsPage({ storeId: "store-a", user });
  expect(page.props.children[1].props).toMatchObject({ canCreate: false, canEdit: true });
});
