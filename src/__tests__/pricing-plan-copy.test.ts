import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function readSource(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

const PLAN_PAGES = [
  "src/app/(dashboard)/dashboard/settings/plans/page.tsx",
  "src/app/pricing/page.tsx",
];

describe("pricing and growth plan copy", () => {
  it.each(PLAN_PAGES)("bundles health assessment and summary on %s", (path) => {
    const source = readSource(path);

    expect(source).toContain("健康評估／摘要");
    expect(source).not.toContain("AI 健康評估入口");
    expect(source).not.toContain("AI 健康摘要");
  });

  it.each(PLAN_PAGES)("keeps the alliance plan focused on multi-store and monthly settlement on %s", (path) => {
    const source = readSource(path);

    expect(source).toContain("總部管理 + 1 家分店");
    expect(source).toContain("第二家分店起，每家 +$1,000/月分店營運費");
    expect(source).toContain("多店管理");
    expect(source).toContain("月結管理");
    expect(source).not.toContain("總部視角");
    expect(source).not.toContain("店舖功能開關");
    expect(source).not.toContain("合作店長結算管理");
  });
});
