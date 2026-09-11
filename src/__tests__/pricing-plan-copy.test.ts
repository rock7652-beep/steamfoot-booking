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

const PUBLIC_PRICING_PAGE = "src/app/pricing/page.tsx";

describe("pricing and growth plan copy", () => {
  it("presents analysis in management modules and includes it in alliance", () => {
    const source = readSource(PUBLIC_PRICING_PAGE);
    expect(source).not.toContain('aria-label="分析功能方案比較"');
    expect(source).toContain('{ label: "分析", values: ["加購", "可選", "內含"] }');
    expect(source).toContain("健康／月結／分析再選 1 項");
    expect(source).toContain("提醒／匯出再選 1 項");
    expect(source).not.toContain("分析另購");
    expect(source).not.toContain("獨立加購・展店版內含");
    expect(source).not.toContain("另購 NT$800／月");
    expect(source).toContain('scope="col"');
    expect(source).toContain('scope="row"');
    expect(source).toContain("sticky top-0");
    expect(source).not.toContain("展店版亦不包含");
    expect(source).not.toContain("經營診斷");
    expect(source).not.toContain("基本收款・營運分析");
  });
  it("uses the official LINE link for consultation and footer contact", () => {
    const source = readSource(PUBLIC_PRICING_PAGE);

    expect(source.match(/href="https:\/\/lin\.ee\/SGy5UBz"/g)).toHaveLength(2);
    expect(source).toContain("官方 LINE：@329rmywc");
    expect(source).not.toContain("lin.ee/placeholder");
  });

  it.each(PLAN_PAGES)("bundles health assessment and summary on %s", (path) => {
    const source = readSource(path);

    expect(source).toContain(path === PUBLIC_PRICING_PAGE ? 'label: "健康評估"' : "健康評估與體態追蹤");
    expect(source).toContain("LINE 顧客入口（LIFF）");
    expect(source).toContain(path === PUBLIC_PRICING_PAGE ? "申請前須知" : "<PlanPackageNotes />");
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

  it("brands the public pricing page as 蒸管家 for service businesses", () => {
    const source = readSource(PUBLIC_PRICING_PAGE);

    expect(source).toContain("蒸管家｜店務管理系統");
    expect(source).toContain("預約制門市、工作室與服務品牌");
    expect(source).not.toContain("蒸足系統方案");
    expect(source).not.toContain("蒸足預約管理系統");
  });
});
