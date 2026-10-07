import { describe, expect, it } from "vitest";
import { buildManagerNotificationCard } from "@/server/services/manager-notification-card";
import { MANAGER_EVENT_PREFERENCE } from "@/lib/manager-notification-preferences";

describe("manager Flex presentation", () => {
  it.each(Object.keys(MANAGER_EVENT_PREFERENCE))("renders %s with store identity and a usable action", title => {
    const card = buildManagerNotificationCard(`${title}\n顧客：王先生\n查看預約：https://example.com/s/a/admin/dashboard/bookings?bookingId=123`, "竹北店", "a");
    expect(card.type).toBe("flex");
    expect(card.altText).toContain("竹北店");
    expect(JSON.stringify(card.contents.body)).not.toContain("https://");
    expect(JSON.stringify(card.contents.footer)).toContain("bookingId=123");
    expect(JSON.stringify(card.contents.footer)).toContain("查看預約");
  });
  it("keeps legacy VIP customer links scoped to the notification store", () => {
    const card = buildManagerNotificationCard("VIP 續購需求\nhttps://example.com/dashboard/customers/123", "店名", "store a");
    expect(JSON.stringify(card.contents.footer)).toContain("/s/store%20a/admin/dashboard/customers/123");
  });
  it("wraps long names and keeps all digest details", () => {
    const body = `今日待辦\n${"長姓名".repeat(150)}\n待付款：3 筆\n未完成：5 筆`;
    const card = buildManagerNotificationCard(body, "長門市名稱".repeat(50));
    expect(Array.from(card.altText).length).toBeLessThanOrEqual(400);
    expect(JSON.stringify(card.contents.body)).toContain("待付款：3 筆");
    expect(JSON.stringify(card.contents.body)).toContain('"wrap":true');
    expect(card.contents.footer).toBeUndefined();
  });
});
