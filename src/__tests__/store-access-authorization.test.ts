import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockHasStoreFeature = vi.fn();
const mockCookieGet = vi.fn();
const mockHeaderGet = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));
vi.mock("@/lib/feature-gate", () => ({
  hasStoreFeature: (...args: unknown[]) => mockHasStoreFeature(...args),
}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: (...args: unknown[]) => mockCookieGet(...args) }),
  headers: () => Promise.resolve({ get: (...args: unknown[]) => mockHeaderGet(...args) }),
}));
vi.mock("react", () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));

const stores = [
  { id: "hq", slug: "hq", name: "HQ", isDefault: true, parentStoreId: null, operatingStatus: "ACTIVE", createdAt: new Date(1) },
  { id: "branch-a", slug: "branch-a", name: "A", isDefault: false, parentStoreId: "hq", operatingStatus: "ACTIVE", createdAt: new Date(2) },
  { id: "branch-b", slug: "branch-b", name: "B", isDefault: false, parentStoreId: "hq", operatingStatus: "TRIAL", createdAt: new Date(3) },
  { id: "inactive", slug: "inactive", name: "Off", isDefault: false, parentStoreId: "hq", operatingStatus: "INACTIVE", createdAt: new Date(4) },
  { id: "other", slug: "other", name: "Other", isDefault: false, parentStoreId: null, operatingStatus: "ACTIVE", createdAt: new Date(5) },
  { id: "paused", slug: "paused", name: "Paused", isDefault: false, parentStoreId: "hq", operatingStatus: "PAUSED", createdAt: new Date(6) },
];

function installStoreQueryMock() {
  mockFindMany.mockImplementation(({ where = {} }: { where?: Record<string, unknown> }) => {
    let rows = [...stores];
    const parent = where.parentStoreId as { in: string[] } | undefined;
    const ids = where.id as { in: string[] } | string | undefined;
    if (parent) rows = rows.filter((store) => parent.in.includes(store.parentStoreId ?? ""));
    if (typeof ids === "string") rows = rows.filter((store) => store.id === ids);
    else if (ids) rows = rows.filter((store) => ids.in.includes(store.id));
    const operatingStatus = where.operatingStatus as { in: string[] } | string | undefined;
    if (typeof operatingStatus === "string") {
      rows = rows.filter((store) => store.operatingStatus === operatingStatus);
    } else if (operatingStatus) {
      rows = rows.filter((store) => operatingStatus.in.includes(store.operatingStatus));
    }
    return Promise.resolve(rows);
  });
}

describe("organization store authorization", () => {
  it("limits a review session to its exact store for reads, writes and switching", async () => {
    const { validateStoreAccess, getAccessibleStores } = await import("@/lib/store");
    const review = { role: "OWNER", storeId: "hq", customerReviewStoreId: "hq" };
    expect((await getAccessibleStores(review)).map(store => store.id)).toEqual(["hq"]);
    for (const mode of ["read", "write", "switch"] as const) {
      await expect(validateStoreAccess(review, "branch-a", mode)).rejects.toThrow("暫時驗收僅限測試店");
      await expect(validateStoreAccess(review, "__all__", mode)).rejects.toThrow("暫時驗收僅限測試店");
      await expect(validateStoreAccess(review, "hq", mode)).resolves.toBe("hq");
    }
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaderGet.mockReturnValue(null);
    mockHasStoreFeature.mockResolvedValue(true);
    installStoreQueryMock();
    mockFindUnique.mockImplementation(({ where }: { where: { slug?: string } }) => {
      const store = stores.find((item) => item.slug === where.slug);
      return Promise.resolve(store ? { id: store.id } : null);
    });
  });

  it.each(["OWNER", "PARTNER"])("reads a single-store %s's authorization metadata only once", async (role) => {
    const { getAccessibleStores } = await import("@/lib/store");
    await expect(getAccessibleStores({ role, storeId: "branch-a" })).resolves.toEqual([
      { id: "branch-a", slug: "branch-a", name: "A", isDefault: false },
    ]);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockHasStoreFeature).not.toHaveBeenCalled();
  });

  it("reuses an own-store row for a mother owner without multi-store entitlement", async () => {
    mockHasStoreFeature.mockResolvedValue(false);
    const { getAccessibleStores } = await import("@/lib/store");
    await expect(getAccessibleStores({ role: "OWNER", storeId: "hq" })).resolves.toEqual([
      { id: "hq", slug: "hq", name: "HQ", isDefault: true },
    ]);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockHasStoreFeature).toHaveBeenCalledTimes(1);
  });

  it("authorizes the own mother store with one status query, without enumerating descendants", async () => {
    const { validateStoreAccess } = await import("@/lib/store");
    await expect(validateStoreAccess({ role: "OWNER", storeId: "hq" }, "hq", "read")).resolves.toBe("hq");
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockHasStoreFeature).not.toHaveBeenCalled();
  });

  it("resolves a concrete child with one authorized tree traversal, not a second DTO lookup", async () => {
    const { resolveAuthorizedConcreteStore } = await import("@/lib/store");
    await expect(resolveAuthorizedConcreteStore({ role: "OWNER", storeId: "hq" }, "branch-a", "switch"))
      .resolves.toEqual({ id: "branch-a", slug: "branch-a", name: "A" });
    // Own row + direct children + empty next level + authorized DTO list.
    // This is a query-count assertion over mocks, not a production timing claim.
    expect(mockFindMany).toHaveBeenCalledTimes(4);
    expect(mockHasStoreFeature).toHaveBeenCalledTimes(1);
  });

  it("resolves the concrete own store in one fresh lookup without enumerating descendants", async () => {
    const { resolveAuthorizedConcreteStore } = await import("@/lib/store");
    await expect(resolveAuthorizedConcreteStore({ role: "OWNER", storeId: "hq" }, "hq", "switch"))
      .resolves.toEqual({ id: "hq", slug: "hq", name: "HQ" });
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockHasStoreFeature).not.toHaveBeenCalled();
  });

  it("does not cache concrete store authorization between operations", async () => {
    const { resolveAuthorizedConcreteStore } = await import("@/lib/store");
    const user = { role: "OWNER", storeId: "hq" };
    await expect(resolveAuthorizedConcreteStore(user, "branch-a", "switch")).resolves.toMatchObject({ id: "branch-a" });
    mockHasStoreFeature.mockResolvedValue(false);
    await expect(resolveAuthorizedConcreteStore(user, "branch-a", "switch")).rejects.toThrow("無權存取");
    // An own-store status change is checked again as well.
    mockFindMany.mockResolvedValue([]);
    await expect(resolveAuthorizedConcreteStore(user, "hq", "switch")).rejects.toThrow("無權存取");
  });

  it("keeps concrete-store reads authorized and descendant writes blocked", async () => {
    const { resolveAuthorizedConcreteStore } = await import("@/lib/store");
    const user = { role: "OWNER", storeId: "hq" };
    await expect(resolveAuthorizedConcreteStore(user, "branch-a", "write")).rejects.toThrow("僅供查閱");
    await expect(resolveAuthorizedConcreteStore(user, "other", "switch")).rejects.toThrow("無權存取");
    await expect(resolveAuthorizedConcreteStore(user, "inactive", "read")).rejects.toThrow("無權存取");
    await expect(resolveAuthorizedConcreteStore({ role: "ADMIN" }, "__all__", "switch")).rejects.toThrow("指定分店");
  });
  it.each(["inactive", "paused"])("still denies own-store access to %s", async (storeId) => {
    const { validateStoreAccess } = await import("@/lib/store");
    await expect(validateStoreAccess({ role: "OWNER", storeId }, storeId, "read")).rejects.toThrow("無權存取");
  });

  it("lets ADMIN access ACTIVE and TRIAL stores and platform all", async () => {
    const { getAccessibleStoreIds, validateStoreAccess } = await import("@/lib/store");
    const user = { role: "ADMIN", storeId: null };
    await expect(getAccessibleStoreIds(user)).resolves.toEqual(["hq", "branch-a", "branch-b", "other"]);
    await expect(validateStoreAccess(user, "__all__", "read")).resolves.toBeNull();
  });

  it.each(["OWNER", "PARTNER"])(
    "lets a TRIAL branch %s access its own store",
    async (role) => {
      const { getAccessibleStoreIds, validateStoreAccess } = await import("@/lib/store");
      const user = { role, storeId: "branch-b" };

      await expect(getAccessibleStoreIds(user)).resolves.toEqual(["branch-b"]);
      await expect(validateStoreAccess(user, "branch-b", "read")).resolves.toBe("branch-b");
      await expect(validateStoreAccess(user, "branch-b", "write")).resolves.toBe("branch-b");
    },
  );

  it.each(["inactive", "paused"])(
    "denies staff access when their own store is %s",
    async (storeId) => {
      const { getAccessibleStoreIds } = await import("@/lib/store");
      await expect(getAccessibleStoreIds({ role: "OWNER", storeId })).rejects.toThrow(
        "店舖已停用或無法存取",
      );
    },
  );

  it("lets an entitled mother OWNER read and switch to descendants but blocks writes", async () => {
    const { getAccessibleStoreIds, validateStoreAccess } = await import("@/lib/store");
    const user = { role: "OWNER", storeId: "hq" };
    await expect(getAccessibleStoreIds(user)).resolves.toEqual(["hq", "branch-a", "branch-b"]);
    await expect(validateStoreAccess(user, "branch-b", "read")).resolves.toBe("branch-b");
    await expect(validateStoreAccess(user, "branch-b", "switch")).resolves.toBe("branch-b");
    await expect(validateStoreAccess(user, "branch-b", "write")).rejects.toThrow("僅供查閱");
    await expect(validateStoreAccess(user, "branch-a", "write")).rejects.toThrow("僅供查閱");
    await expect(validateStoreAccess(user, "other", "read")).rejects.toThrow("無權存取");
    await expect(validateStoreAccess(user, "inactive", "read")).rejects.toThrow("無權存取");
    await expect(validateStoreAccess(user, "paused", "read")).rejects.toThrow("無權存取");
    await expect(validateStoreAccess(user, "__all__", "read")).rejects.toThrow("無權查看全部分店");
  });

  it("does not expose descendants without the multi_store entitlement", async () => {
    const { getAccessibleStoreIds, validateStoreAccess } = await import("@/lib/store");
    mockHasStoreFeature.mockResolvedValue(false);
    const user = { role: "OWNER", storeId: "hq" };

    await expect(getAccessibleStoreIds(user)).resolves.toEqual(["hq"]);
    await expect(validateStoreAccess(user, "branch-b", "switch")).rejects.toThrow("無權存取");
  });

  it("includes ACTIVE and TRIAL stores in background operations only", async () => {
    const { getAllActiveStoreIds } = await import("@/lib/store");
    await expect(getAllActiveStoreIds()).resolves.toEqual(["hq", "branch-a", "branch-b", "other"]);
  });

  it("pins PARTNER and branch OWNER to their session store", async () => {
    const { validateStoreAccess } = await import("@/lib/store");
    await expect(validateStoreAccess({ role: "PARTNER", storeId: "branch-a" }, "branch-b", "read"))
      .rejects.toThrow("無權存取");
    await expect(validateStoreAccess({ role: "OWNER", storeId: "branch-a" }, "hq", "write"))
      .rejects.toThrow("無權存取");
  });

  it("uses the OWNER viewed cookie for reads and blocks writes", async () => {
    const { getActiveStoreForRead, resolveWriteStoreId } = await import("@/lib/store");
    mockCookieGet.mockImplementation((name: string) => name === "viewed-store-id" ? { value: "branch-b" } : undefined);
    const user = { role: "OWNER", storeId: "hq" };
    await expect(getActiveStoreForRead(user)).resolves.toBe("branch-b");
    await expect(resolveWriteStoreId(user)).rejects.toThrow("僅供查閱");

    mockCookieGet.mockImplementation(() => ({ value: "other" }));
    await expect(getActiveStoreForRead(user)).rejects.toThrow("無權存取");
    await expect(resolveWriteStoreId(user)).rejects.toThrow("無權存取");
  });

  it("prefers an authorized route store for reads but blocks route writes", async () => {
    const { getActiveStoreForRead, resolveWriteStoreId } = await import("@/lib/store");
    mockHeaderGet.mockImplementation((name: string) => {
      if (name === "x-next-pathname") return "/s/branch-b/admin/dashboard/reminders";
      if (name === "x-store-slug") return "branch-b";
      return null;
    });
    mockCookieGet.mockImplementation(() => ({ value: "other" }));
    const user = { role: "OWNER", storeId: "hq" };

    await expect(getActiveStoreForRead(user)).resolves.toBe("branch-b");
    await expect(resolveWriteStoreId(user)).rejects.toThrow("僅供查閱");
  });

  it("rejects an unauthorized route even when the cookie is the own store", async () => {
    const { getActiveStoreForRead, resolveWriteStoreId } = await import("@/lib/store");
    mockHeaderGet.mockImplementation((name: string) => {
      if (name === "x-next-pathname") return "/s/other/admin/dashboard/staff";
      if (name === "x-store-slug") return "other";
      return null;
    });
    mockCookieGet.mockImplementation(() => ({ value: "hq" }));
    const user = { role: "OWNER", storeId: "hq" };

    await expect(getActiveStoreForRead(user)).rejects.toThrow("無權存取");
    await expect(resolveWriteStoreId(user)).rejects.toThrow("無權存取");
  });

  it("rejects mismatched forwarded route headers", async () => {
    const { getActiveStoreForRead } = await import("@/lib/store");
    mockHeaderGet.mockImplementation((name: string) => {
      if (name === "x-next-pathname") return "/s/branch-b/admin/dashboard";
      if (name === "x-store-slug") return "attacker-supplied";
      return null;
    });

    await expect(getActiveStoreForRead({ role: "OWNER", storeId: "hq" }))
      .rejects.toThrow("店舖路由資訊無效");
  });
});

it("filters unsupported persisted module enums before Prisma decodes the HQ selector",async()=>{
  const {getAccessibleStores}=await import("@/lib/store");
  await getAccessibleStores({role:"ADMIN"});
  expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({industryModule:{in:["STEAMFOOT","COURSE","BEAUTY"]}})}));
});

import {rememberVerifiedStaffRead,withReadRequestMemo} from '@/server/services/read-request-memo';
const stamped={userId:'user-hq',role:'OWNER',staffId:'staff-hq',storeId:'hq',industryModule:'COURSE',store:{slug:'hq',name:'HQ',operatingStatus:'ACTIVE'}};
const stampedUser={id:'user-hq',role:'OWNER',staffId:'staff-hq',storeId:'hq'};
it('validates the live auth store snapshot only within its exact read actor and does not reuse it for switches',async()=>{
 mockFindMany.mockReset();installStoreQueryMock();
 const {validateStoreAccess}=await import('@/lib/store');
 await withReadRequestMemo(async()=>{rememberVerifiedStaffRead(stamped);expect(await validateStoreAccess(stampedUser,'hq','read')).toBe('hq');expect(await validateStoreAccess(stampedUser,'hq','write')).toBe('hq');expect(mockFindMany).not.toHaveBeenCalled();await validateStoreAccess(stampedUser,'hq','switch');expect(mockFindMany).toHaveBeenCalledOnce();});
 mockFindMany.mockResolvedValueOnce([]);await expect(withReadRequestMemo(()=>validateStoreAccess(stampedUser,'hq','read'))).rejects.toThrow('已停用');expect(mockFindMany).toHaveBeenCalledTimes(2);
});
it.each(['PAUSED','INACTIVE','UNKNOWN'])('rejects non-operating auth store metadata %s without falling back to a stale allowed store',async operatingStatus=>{
 mockFindMany.mockClear();const {validateStoreAccess}=await import('@/lib/store');
 await expect(withReadRequestMemo(async()=>{rememberVerifiedStaffRead({...stamped,store:{...stamped.store,operatingStatus}});return validateStoreAccess(stampedUser,'hq','read');})).rejects.toThrow('已停用');expect(mockFindMany).not.toHaveBeenCalled();
});
it.each([{userId:'other'},{role:'STAFF'},{staffId:'other'},{storeId:'other'}])('requires an exact actor for auth store reuse: %j',async mismatch=>{
 mockFindMany.mockReset();installStoreQueryMock();const {validateStoreAccess}=await import('@/lib/store');
 await withReadRequestMemo(async()=>{rememberVerifiedStaffRead({...stamped,...mismatch});await validateStoreAccess(stampedUser,'hq','read');});expect(mockFindMany).toHaveBeenCalledOnce();
});
it.each(['SPA','UNKNOWN'])('rejects unsupported auth store module %s',async industryModule=>{
 const {validateStoreAccess}=await import('@/lib/store');await expect(withReadRequestMemo(async()=>{rememberVerifiedStaffRead({...stamped,industryModule});return validateStoreAccess(stampedUser,'hq','read');})).rejects.toThrow('已停用');
});
it('resolves an exactly matching route from the live auth store, retaining forwarded-header validation and next-request lookup',async()=>{
 mockFindUnique.mockClear();mockFindMany.mockClear();mockCookieGet.mockReturnValue(undefined);
 mockHeaderGet.mockImplementation((name:string)=>name==='x-next-pathname'?'/s/hq/admin/dashboard/courses':name==='x-store-slug'?'hq':null);
 const {getActiveStoreForRead}=await import('@/lib/store');
 await withReadRequestMemo(async()=>{rememberVerifiedStaffRead(stamped);expect(await getActiveStoreForRead(stampedUser)).toBe('hq');});expect(mockFindUnique).not.toHaveBeenCalled();expect(mockFindMany).not.toHaveBeenCalled();
 mockHeaderGet.mockImplementation((name:string)=>name==='x-next-pathname'?'/s/hq/admin/dashboard/courses':name==='x-store-slug'?'forged':null);
 await expect(withReadRequestMemo(async()=>{rememberVerifiedStaffRead(stamped);return getActiveStoreForRead(stampedUser);})).rejects.toThrow('路由資訊無效');
 mockHeaderGet.mockImplementation((name:string)=>name==='x-next-pathname'?'/s/hq/admin/dashboard/courses':name==='x-store-slug'?'hq':null);
 mockFindUnique.mockResolvedValueOnce(null);await expect(withReadRequestMemo(()=>getActiveStoreForRead(stampedUser))).rejects.toThrow('已停用');expect(mockFindUnique).toHaveBeenCalledOnce();
});
