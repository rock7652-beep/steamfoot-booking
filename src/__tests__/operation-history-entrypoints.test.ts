import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("operation history entrypoints", () => {
  it("shows history beside every cashbook record", () => {
    const cashbook = read("src/app/(dashboard)/dashboard/cashbook/page.tsx");
    expect(cashbook).toContain('<OperationHistoryButton targetType="CashbookEntry" targetId={e.id} />');
  });

  it("renders actor snapshot and before/after changes", () => {
    const history = read("src/components/operation-history-button.tsx");
    expect(history).toContain("item.actorNameSnapshot ?? item.actor.name");
    expect(history).toContain("<AuditChanges before={item.beforeJson} after={item.afterJson} references={item.references} />");
  });
});
