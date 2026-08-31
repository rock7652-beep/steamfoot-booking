import { describe, expect, it } from "vitest";
import type { SpaDemoBookingNotification } from "@/lib/spa-demo-store";
import { buildSpaDemoBookingLineMessages } from "@/server/services/spa-demo-line-message";

const notification: SpaDemoBookingNotification = {
  kind: "BOOKED",
  title: "預約成功",
  date: "2026-09-01",
  time: "15:30",
  lines: [
    "第 1 位・全身精油舒壓・60 分鐘",
    "同行者 2・臉部保濕護理・60 分鐘",
    "同行者 3・深層舒眠組合・120 分鐘",
  ],
  summary: "共 3 位・預估 NT$5,000",
};

describe("SPA Demo LINE booking card", () => {
  it("keeps the whole party in one notification card", () => {
    const messages = buildSpaDemoBookingLineMessages(
      notification,
      "https://preview.example.com/s/demo/liff/design-preview/booking",
    );

    expect(messages).toHaveLength(1);
    expect(JSON.stringify(messages[0])).toContain("同行者 3・深層舒眠組合・120 分鐘");
    expect(JSON.stringify(messages[0])).toContain("共 3 位・預估 NT$5,000");
    expect(JSON.stringify(messages[0])).toContain("查看／修改／取消預約");
    expect(JSON.stringify(messages[0])).toContain("https://preview.example.com/s/demo/liff/design-preview/booking");
  });

  it("uses a read-only label after cancellation", () => {
    const messages = buildSpaDemoBookingLineMessages(
      { ...notification, kind: "CANCELLED", title: "預約已取消" },
      "https://preview.example.com/s/demo/liff/design-preview/booking",
    );

    expect(JSON.stringify(messages[0])).toContain("查看預約");
    expect(JSON.stringify(messages[0])).not.toContain("查看／修改／取消預約");
  });
});
