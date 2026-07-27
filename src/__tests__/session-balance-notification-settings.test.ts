import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/line", () => ({
  pushMessage: vi.fn(),
  pushSteamButlerMessage: vi.fn(),
}));
vi.mock("@/lib/base-url", () => ({
  deriveBaseUrl: () => "https://www.steamfoot.com",
}));

import {
  DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING,
  renderSessionBalanceTemplate,
} from "@/lib/session-balance-notification-settings";
import { enqueueSessionBalanceNotifications } from "@/server/services/session-balance-notifications";

function makeTx(input: {
  setting: {
    isEnabled: boolean;
    lastSessionEnabled: boolean;
    planUsedUpEnabled: boolean;
  } | null;
  remainingSessions: number;
  continuationWalletIds?: string[];
}) {
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  const findNotifications = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
  const findWallets = vi
    .fn()
    .mockResolvedValueOnce([
      { id: "wallet-1", remainingSessions: input.remainingSessions },
    ])
    .mockResolvedValueOnce(
      (input.continuationWalletIds ?? []).map((id) => ({ id })),
    );
  return {
    tx: {
      customerPlanWallet: { findMany: findWallets },
      sessionBalanceNotificationSetting: {
        findUnique: vi.fn().mockResolvedValue(input.setting),
      },
      sessionBalanceNotification: {
        createMany,
        findMany: findNotifications,
      },
    },
    createMany,
  };
}

describe("session balance notification settings", () => {
  it("keeps the database migration additive and store scoped", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260727190000_add_session_balance_notification_settings/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain('CREATE TABLE "SessionBalanceNotificationSetting"');
    expect(sql).toContain('"storeId" TEXT NOT NULL');
    expect(sql).toContain(
      'ALTER TABLE "SessionBalanceNotificationSetting" ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
  });

  it("keeps the LINE response closure migration additive", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260727194500_add_session_balance_response_closure/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain('ALTER TABLE "SessionBalanceNotification"');
    expect(sql).toContain('"responseAction" TEXT');
    expect(sql).toContain('"managerNotificationStatus" "MessageLogStatus"');
    expect(sql).toContain(
      'ALTER TABLE "SessionBalanceNotification" ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
  });

  it("renders all supported dynamic variables", () => {
    expect(
      renderSessionBalanceTemplate(
        "{customerName}｜{planName}｜{bookingDateTime}｜{bookingUrl}",
        {
          customerName: "小美",
          planName: "5 堂方案",
          bookingDateTime: "2026-08-05 14:00",
          bookingUrl: "https://example.com/book",
        },
      ),
    ).toBe(
      "小美｜5 堂方案｜2026-08-05 14:00｜https://example.com/book",
    );
  });

  it("uses enabled defaults for stores without a saved setting", async () => {
    const { tx, createMany } = makeTx({
      setting: null,
      remainingSessions: 1,
    });
    const ids = await enqueueSessionBalanceNotifications(
      tx as never,
      { walletIds: ["wallet-1"], customerId: "customer-1", storeId: "store-1" },
    );
    expect(DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING.isEnabled).toBe(true);
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ type: "LAST_SESSION", storeId: "store-1" }),
        ],
      }),
    );
    expect(ids).toEqual(["notification-1"]);
  });

  it("does not enqueue when the store master switch is off", async () => {
    const { tx, createMany } = makeTx({
      setting: {
        isEnabled: false,
        lastSessionEnabled: true,
        planUsedUpEnabled: true,
      },
      remainingSessions: 1,
    });
    await expect(
      enqueueSessionBalanceNotifications(
        tx as never,
        { walletIds: ["wallet-1"], customerId: "customer-1", storeId: "store-1" },
      ),
    ).resolves.toEqual([]);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("honors the per-stage switch", async () => {
    const { tx, createMany } = makeTx({
      setting: {
        isEnabled: true,
        lastSessionEnabled: true,
        planUsedUpEnabled: false,
      },
      remainingSessions: 0,
    });
    await expect(
      enqueueSessionBalanceNotifications(
        tx as never,
        { walletIds: ["wallet-1"], customerId: "customer-1", storeId: "store-1" },
      ),
    ).resolves.toEqual([]);
    expect(createMany).not.toHaveBeenCalled();
  });
});
