import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("daily action digest source contract", () => {
  it("runs at 09:00 Taiwan time and sends only one combined digest", () => {
    const vercel = source("vercel.json");
    const service = source("src/server/services/daily-action-digest.ts");
    const notification = source("src/server/services/store-manager-line-notifications.ts");

    expect(vercel).toContain('"path": "/api/cron/daily-action-digest"');
    expect(vercel).toContain('"schedule": "0 1 * * *"');
    expect(service).toContain("pendingPaymentCount + incompleteServiceCount === 0");
    expect(service).toContain('type: "DAILY_ACTION_DIGEST"');
    expect(notification).toContain("☀️ 今日待辦");
    expect(notification).toContain("待確認付款");
    expect(notification).toContain("昨日未完成服務");
  });

  it("protects the cron route and isolates failures by store", () => {
    const route = source("src/app/api/cron/daily-action-digest/route.ts");
    const service = source("src/server/services/daily-action-digest.ts");

    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("Unauthorized");
    expect(service).toContain("for (const store of stores)");
    expect(service).toContain("[DailyActionDigest] store failed");
  });
});
