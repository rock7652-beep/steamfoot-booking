import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ruleFindUnique: vi.fn(),
  ruleUpdate: vi.fn(),
  ruleFindFirst: vi.fn(),
  templateFindUnique: vi.fn(),
  templateUpdate: vi.fn(),
  resolveWriteStoreId: vi.fn(),
  requireStoreFeature: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    reminderRule: {
      findUnique: (...args: unknown[]) => mocks.ruleFindUnique(...args),
      findFirst: (...args: unknown[]) => mocks.ruleFindFirst(...args),
      update: (...args: unknown[]) => mocks.ruleUpdate(...args),
    },
    messageTemplate: {
      findUnique: (...args: unknown[]) => mocks.templateFindUnique(...args),
      update: (...args: unknown[]) => mocks.templateUpdate(...args),
    },
  },
}));
vi.mock("@/lib/session", () => ({
  requireStaffSession: vi.fn(async () => ({ role: "OWNER", storeId: "mother" })),
  requireAdminSession: vi.fn(),
}));
vi.mock("@/lib/store", () => ({
  resolveWriteStoreId: (...args: unknown[]) => mocks.resolveWriteStoreId(...args),
}));
vi.mock("@/lib/feature-gate", () => ({
  requireStoreFeature: (...args: unknown[]) => mocks.requireStoreFeature(...args),
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: vi.fn() }));
vi.mock("@/lib/line", () => ({
  pushMessage: vi.fn(),
  renderTemplate: vi.fn(),
  probeStoreLineRecipient: vi.fn(async () => ({ status: "COMPATIBLE" })),
}));
vi.mock("@/lib/line-config", () => ({ isLineSmokeTestEnabled: vi.fn(() => false) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("reminder concrete-store mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWriteStoreId.mockResolvedValue("branch-a");
    mocks.requireStoreFeature.mockResolvedValue(undefined);
  });

  it("rejects a reminder rule id owned by another store", async () => {
    mocks.ruleFindUnique.mockResolvedValue({ id: "rule-b", storeId: "branch-b" });
    const { updateReminderRule } = await import("@/server/actions/reminder");
    const result = await updateReminderRule("rule-b", { name: "changed" });

    expect(result.success).toBe(false);
    expect(mocks.ruleUpdate).not.toHaveBeenCalled();
  });

  it("rejects a message template id owned by another store", async () => {
    mocks.templateFindUnique.mockResolvedValue({ id: "template-b", storeId: "branch-b" });
    const { updateMessageTemplate } = await import("@/server/actions/reminder");
    const result = await updateMessageTemplate("template-b", { name: "changed" });

    expect(result.success).toBe(false);
    expect(mocks.templateUpdate).not.toHaveBeenCalled();
  });

  it("does not bind a foreign-store template to the selected store rule", async () => {
    mocks.ruleFindFirst.mockResolvedValue({ id: "rule-a" });
    mocks.templateFindUnique.mockResolvedValue({ id: "template-b", storeId: "branch-b" });
    const { setReminderTemplate } = await import("@/server/actions/reminder");
    const result = await setReminderTemplate("template-b");

    expect(result.success).toBe(false);
    expect(mocks.ruleUpdate).not.toHaveBeenCalled();
  });
});
