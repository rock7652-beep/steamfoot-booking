import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("birthday profile UI contract", () => {
  it("uses the shared year/month/day picker in customer and staff forms", () => {
    for (const file of [
      "src/app/(customer)/profile/profile-form.tsx",
      "src/app/(dashboard)/dashboard/customers/new/page.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/edit/edit-customer-form.tsx",
    ]) {
      expect(read(file)).toContain("BirthdayFields");
      expect(read(file)).not.toMatch(/name=["']birthday["'][^>]*type=["']date["']/);
    }
    const picker = read("src/components/birthday-fields.tsx");
    expect(picker).toContain("min={1920}");
    expect(picker).toContain('defaultYear = "1970"');
    expect(picker).toContain("daysInMonth");
  });

  it("shows the mandatory birthday copy without a skip action", () => {
    const page = read("src/app/(customer)/profile/page.tsx");
    const form = read("src/app/(customer)/profile/profile-form.tsx");
    expect(page).toContain("完善生日資料");
    expect(page).toContain("填寫完整生日，之後即可收到專屬優惠。");
    expect(form).toContain("完成填寫");
    expect(`${page}${form}`).not.toContain("稍後再說");
  });

  it("renders a padded birthday and explicit empty state in staff detail", () => {
    const detail = read(
      "src/app/(dashboard)/dashboard/customers/[id]/_components/customer-basic-info.tsx",
    );
    expect(detail).toContain("formatBirthday(birthday)");
    expect(detail).toContain("尚未填寫");
  });
});
