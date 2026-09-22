// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ browse: vi.fn() }));
vi.mock("@/server/actions/course-browse", () => ({
  browseCourseCards: mocks.browse,
}));

import { CourseCardBrowser } from "@/app/(dashboard)/dashboard/courses/card-browser";

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

it("shows shared-card members directly on an active plan row", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.browse.mockResolvedValue({
    success: true,
    rows: [{
      id: "card-shared",
      name: "運動十點方案",
      unit: "POINT",
      templateIds: [],
      termSessionIds: [],
      remaining: 8,
      held: 2,
      available: 6,
      closed: false,
      expired: false,
      expiresAt: "2026-12-31T00:00:00.000Z",
      members: [
        { id: "customer-a", name: "王小美", phone: "0911111111" },
        { id: "customer-b", name: "陳小樂", phone: "0922222222" },
      ],
      entries: [],
    }],
    hasMore: false,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(createElement(CourseCardBrowser, {
        customerId: "customer-a",
        state: { search: "", history: false, page: 0 },
        onChange: vi.fn(),
        onSelect: vi.fn(),
      }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(host.textContent).toContain("共卡人：王小美、陳小樂");
    expect(host.textContent).toContain("占用 2 · 剩餘 8");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
