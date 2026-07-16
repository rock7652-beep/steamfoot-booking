import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureGate } from "@/components/feature-gate";
import { FEATURES } from "@/lib/feature-flags";

const read = (path: string) => readFileSync(path, "utf8");

describe("line_reminder effective entitlement contract", () => {
  it("lets a server-resolved ENABLED override bypass a plan-only upgrade wall", () => {
    const html = renderToStaticMarkup(
      <FeatureGate plan="GROWTH" feature={FEATURES.LINE_REMINDER} enabled>
        <div>提醒功能內容</div>
      </FeatureGate>,
    );

    expect(html).toContain("提醒功能內容");
    expect(html).not.toContain("升級至");
  });

  it("lets a server-resolved DISABLED override block a plan-included feature", () => {
    const html = renderToStaticMarkup(
      <FeatureGate plan="ALLIANCE" feature={FEATURES.LINE_REMINDER} enabled={false}>
        <div>提醒功能內容</div>
      </FeatureGate>,
    );

    expect(html).not.toContain("提醒功能內容");
    expect(html).toContain("升級至");
  });

  it("checks effective entitlement before reminder feature queries", () => {
    const page = read("src/app/(dashboard)/dashboard/reminders/page.tsx");
    const gateIndex = page.indexOf("if (!lineReminderEnabled)");
    const queryIndex = page.indexOf("getReminderStats(activeStoreId)");

    expect(page).toContain("hasStoreFeature(activeStoreId, FEATURES.LINE_REMINDER)");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(queryIndex).toBeGreaterThan(gateIndex);
    expect(page).toContain("enabled={lineReminderEnabled}");
  });

  it("passes the concrete store effective result into sidebar navigation", () => {
    const layout = read("src/app/(dashboard)/layout.tsx");
    const sidebar = read("src/components/sidebar.tsx");

    expect(layout).toContain("hasStoreFeature(\n          effectiveStoreId,\n          FEATURES.LINE_REMINDER");
    expect(layout).toContain("effectiveFeatures={effectiveFeatures}");
    expect(sidebar).toContain("effectiveFeatures[item.requiredFeature] ?? hasFeature");
  });

  it("keeps actions and cron on the effective resolver", () => {
    const actions = read("src/server/actions/reminder.ts");
    const engine = read("src/server/reminder-engine.ts");

    expect(actions).toContain("requireStoreFeature(storeId, FEATURES.LINE_REMINDER)");
    expect(engine).toContain("hasStoreFeature(rule.storeId, FEATURES.LINE_REMINDER)");
  });
});
