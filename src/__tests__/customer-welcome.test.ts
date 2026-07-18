import { describe, expect, it } from "vitest";
import { customerWelcomeTitle } from "@/lib/customer-welcome";

describe("customerWelcomeTitle", () => {
  it.each([
    ["taichung", "暖沐蒸足", "歡迎使用暖沐蒸足"],
    ["zhubei", "暖暖蒸足竹北店", "歡迎使用暖暖蒸足竹北店"],
    ["other", "其他店家", "歡迎使用其他店家"],
  ])("uses the resolved %s Store.name", (_slug, name, expected) => {
    expect(customerWelcomeTitle({ name })).toBe(expected);
  });

  it("fails safely without a store name", () => {
    expect(customerWelcomeTitle(null)).toBe("歡迎使用本店服務");
    expect(customerWelcomeTitle({ name: "  " })).toBe("歡迎使用本店服務");
  });
});
