import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockStoreFindMany = vi.fn();
const mockHasStoreFeature = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findMany: (...args: unknown[]) => mockStoreFindMany(...args),
    },
  },
}));

vi.mock("@/lib/feature-gate", () => ({
  hasStoreFeature: (...args: unknown[]) => mockHasStoreFeature(...args),
}));

import {
  getHealthFlowEnvironmentDiagnostics,
  getLineHealthFlowDiagnostics,
} from "@/server/services/line-healthflow-diagnostics";

describe("line healthflow diagnostics", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mockHasStoreFeature.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports HealthFlow env presence without exposing values", () => {
    vi.stubEnv("HEALTH_API_URL", "https://health.example.test");
    vi.stubEnv("HEALTH_API_KEY", "secret-health-key");

    const diagnostics = getHealthFlowEnvironmentDiagnostics();

    expect(diagnostics).toEqual([
      {
        key: "HEALTH_API_URL",
        label: "HealthFlow API URL",
        exists: true,
        status: "PASS",
      },
      {
        key: "HEALTH_API_KEY",
        label: "HealthFlow API Key",
        exists: true,
        status: "PASS",
      },
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("secret-health-key");
  });

  it("marks missing LINE and LIFF settings without calling external APIs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockStoreFindMany.mockResolvedValue([
      {
        id: "store-unknown",
        slug: "unknown",
        name: "Unknown Store",
        plan: "BASIC",
        lineDestination: null,
        liffId: null,
      },
    ]);

    const diagnostics = await getLineHealthFlowDiagnostics();

    expect(mockStoreFindMany).toHaveBeenCalledWith({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        lineDestination: true,
        liffId: true,
      },
    });
    expect(diagnostics.stores[0]).toMatchObject({
      status: "MISSING",
      lineDestination: { exists: false, status: "MISSING" },
      liff: {
        exists: false,
        source: "MISSING",
        envName: "NEXT_PUBLIC_LIFF_ID_UNKNOWN",
        status: "MISSING",
      },
      lineEnvironment: {
        mappedStoreSlug: null,
        accessTokenEnvName: null,
        channelSecretEnvName: null,
        hasAccessToken: false,
        hasSecret: false,
        status: "MISSING",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns when slug env mapping exists but store.id runtime mapping is missing", async () => {
    vi.stubEnv("LINE_HSINCHU_CHANNEL_ACCESS_TOKEN", "hsinchu-token");
    vi.stubEnv("LINE_HSINCHU_CHANNEL_SECRET", "hsinchu-secret");
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID_HSINCHU", "liff-id");
    mockStoreFindMany.mockResolvedValue([
      {
        id: "uuid-hsinchu",
        slug: "hsinchu",
        name: "新竹店",
        plan: "BASIC",
        lineDestination: "D_hsinchu",
        liffId: null,
      },
    ]);

    const diagnostics = await getLineHealthFlowDiagnostics();

    expect(diagnostics.stores[0]).toMatchObject({
      status: "WARN",
      lineDestination: { exists: true, status: "PASS" },
      liff: {
        exists: true,
        source: "ENV",
        envName: "NEXT_PUBLIC_LIFF_ID_HSINCHU",
        status: "PASS",
      },
      lineEnvironment: {
        mappedStoreSlug: "hsinchu",
        accessTokenEnvName: "LINE_HSINCHU_CHANNEL_ACCESS_TOKEN",
        channelSecretEnvName: "LINE_HSINCHU_CHANNEL_SECRET",
        hasAccessToken: false,
        hasSecret: false,
        status: "WARN",
        detail: "slug env 存在，但 store.id runtime mapping 未完整",
      },
    });
    expect(JSON.stringify(diagnostics)).not.toContain("hsinchu-token");
    expect(JSON.stringify(diagnostics)).not.toContain("hsinchu-secret");
  });
});
