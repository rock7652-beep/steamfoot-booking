import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockGetLineHealthFlowDiagnostics = vi.fn();
const mockRedirect = vi.fn((href: string) => {
  throw new Error(`redirect:${href}`);
});

vi.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/server/services/line-healthflow-diagnostics", () => ({
  getLineHealthFlowDiagnostics: () => mockGetLineHealthFlowDiagnostics(),
}));

vi.mock("@/components/dashboard-link", () => ({
  DashboardLink: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("a", { href, className }, children),
}));

vi.mock("@/components/desktop", () => ({
  PageShell: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("main", { className }, children),
  PageHeader: ({
    title,
    subtitle,
    actions,
  }: {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
  }) =>
    React.createElement(
      "header",
      null,
      React.createElement("h1", null, title),
      subtitle ? React.createElement("p", null, subtitle) : null,
      actions,
    ),
}));

import LineHealthFlowDiagnosticsPage from "@/app/hq/dashboard/diagnostics/line-healthflow/page";

const DIAGNOSTICS = {
  environment: [
    {
      key: "HEALTH_API_URL",
      label: "HealthFlow API URL",
      exists: true,
      status: "PASS",
    },
    {
      key: "HEALTH_API_KEY",
      label: "HealthFlow API Key",
      exists: false,
      status: "MISSING",
    },
  ],
  stores: [
    {
      id: "store-1",
      slug: "zhubei",
      name: "竹北店",
      planLabel: "專業版",
      status: "WARN",
      lineDestination: { exists: true, status: "PASS" },
      liff: {
        exists: true,
        source: "DB",
        envName: "NEXT_PUBLIC_LIFF_ID_ZHUBEI",
        status: "PASS",
      },
      lineEnvironment: {
        mappedStoreSlug: "zhubei",
        accessTokenEnvName: "LINE_CHANNEL_ACCESS_TOKEN",
        channelSecretEnvName: "LINE_CHANNEL_SECRET",
        hasAccessToken: true,
        hasSecret: true,
        status: "PASS",
        detail: "store.id runtime mapping 完整",
      },
      features: [
        {
          key: "line_reminder",
          label: "LINE 提醒",
          available: true,
          status: "PASS",
          detail: "目前可用",
        },
        {
          key: "ai_health_summary",
          label: "AI 健康摘要",
          available: false,
          status: "WARN",
          detail: "目前未開通或依方案不可用",
        },
        {
          key: "member_portal",
          label: "LINE 會員中心",
          available: true,
          status: "PASS",
          detail: "目前可用",
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  mockGetLineHealthFlowDiagnostics.mockResolvedValue(DIAGNOSTICS);
});

describe("LineHealthFlowDiagnosticsPage", () => {
  it("redirects non-admin users to HQ login", async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ id: "owner-1", role: "OWNER" });

    await expect(LineHealthFlowDiagnosticsPage()).rejects.toThrow("redirect:/hq/login");
    expect(mockGetLineHealthFlowDiagnostics).not.toHaveBeenCalled();
  });

  it("renders read-only diagnostics without secret values", async () => {
    const html = renderToStaticMarkup(await LineHealthFlowDiagnosticsPage());

    expect(html).toContain("LINE / LIFF / HealthFlow 設定診斷");
    expect(html).toContain("只讀檢查各店 LINE、LIFF 與 HealthFlow 設定完整度");
    expect(html).toContain("HEALTH_API_URL");
    expect(html).toContain("HEALTH_API_KEY");
    expect(html).toContain("竹北店");
    expect(html).toContain("LINE_CHANNEL_ACCESS_TOKEN");
    expect(html).toContain("LINE_CHANNEL_SECRET");
    expect(html).toContain("AI 健康摘要");
    expect(html).not.toContain("super-secret-value");
    expect(html).not.toContain("token-value");
  });
});
