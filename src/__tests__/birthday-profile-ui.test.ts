import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BirthdayFields,
  normalizeBirthdayInput,
} from "@/components/birthday-fields";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: vi.fn() }),
}));
vi.mock("@/hooks/use-one-shot-action-state", () => ({
  useOneShotActionState: () => undefined,
}));
vi.mock("@/lib/store-context", () => ({
  useStoreSlugRequired: () => "staging",
}));
vi.mock("@/server/actions/profile", () => ({
  updateProfileAction: vi.fn(),
}));

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("birthday profile UI contract", () => {
  it.each([
    ["null", null, ""],
    ["Date", new Date("1970-01-05T00:00:00.000Z"), "1970-01-05"],
    ["ISO timestamp", "1970-01-05T00:00:00.000Z", "1970-01-05"],
    ["date-only", "1970-01-05", "1970-01-05"],
  ])("renders a %s birthday value without throwing", (_label, value, normalized) => {
    expect(normalizeBirthdayInput(value)).toBe(normalized);
    expect(() =>
      renderToStaticMarkup(React.createElement(BirthdayFields, { defaultValue: value })),
    ).not.toThrow();
  });

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

  it("keeps birthday optional in the customer profile", () => {
    const form = read("src/app/(customer)/profile/profile-form.tsx");
    expect(form).toContain("生日");
    expect(form).toContain("（選填）");
    expect(form).not.toContain("birthdayRequired");
  });

  it("keeps birthday and gender stacked on phones without field overflow", () => {
    const form = read("src/app/(customer)/profile/profile-form.tsx");
    const picker = read("src/components/birthday-fields.tsx");
    const page = read("src/app/(customer)/profile/page.tsx");

    expect(form).toContain("grid-cols-1 gap-5 sm:grid-cols-2");
    expect(picker).toContain("minmax(0,1.3fr)");
    expect(picker).toContain("h-12 min-w-0 w-full");
    expect(page).toContain("bg-white p-4 shadow-sm sm:p-6");
  });

  it("renders the real profile form for an existing customer with null birthday", async () => {
    const { ProfileForm } = await import("@/app/(customer)/profile/profile-form");
    const html = renderToStaticMarkup(
      React.createElement(ProfileForm, {
        customer: {
          name: "測試顧客",
          phone: "0911000001",
          email: null,
          gender: null,
          birthday: null,
          address: null,
          notes: null,
        },
        age: null,
        hasPassword: true,
        onboardingMode: true,
        nextPath: "/s/staging/book",
      }),
    );
    expect(html).toContain("完成註冊並開始使用");
    expect(html).toContain('name="birthday"');
    expect(html).toContain('id="birthday-year"');
    expect(html).toContain('id="birthday-month"');
    expect(html).toContain('id="birthday-day"');
  });

  it("renders a padded birthday and explicit empty state in staff detail", () => {
    const detail = read(
      "src/app/(dashboard)/dashboard/customers/[id]/_components/customer-basic-info.tsx",
    );
    expect(detail).toContain("formatBirthday(birthday)");
    expect(detail).toContain("尚未填寫");
  });
});
