import { describe, expect, it } from "vitest";
import { formatBirthday, parseBirthday } from "@/lib/birthday";
import { missingRequiredFields } from "@/lib/customer-completion";

const NOW = new Date("2026-07-12T04:00:00.000Z");

describe("birthday date-only rules", () => {
  it("stores a valid birthday at UTC midnight and formats it with padded fields", () => {
    const result = parseBirthday("1970-01-05", NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.toISOString()).toBe("1970-01-05T00:00:00.000Z");
    expect(formatBirthday(result.value)).toBe("1970/01/05");
  });

  it("accepts leap-day only in a leap year", () => {
    expect(parseBirthday("2000-02-29", NOW).success).toBe(true);
    expect(parseBirthday("2001-02-29", NOW)).toEqual({
      success: false,
      error: "生日日期不存在",
    });
  });

  it("rejects impossible and future dates", () => {
    expect(parseBirthday("1990-04-31", NOW).success).toBe(false);
    expect(parseBirthday("2026-07-13", NOW)).toEqual({
      success: false,
      error: "生日不可晚於今天",
    });
  });

  it("allows legacy null data but marks birthday as required for portal completion", () => {
    expect(missingRequiredFields({ name: "王小明", phone: "0912345678", birthday: null }))
      .toContain("birthday");
    expect(
      missingRequiredFields({
        name: "王小明",
        phone: "0912345678",
        birthday: new Date("1970-01-05T00:00:00.000Z"),
      }),
    ).toEqual([]);
  });
});
