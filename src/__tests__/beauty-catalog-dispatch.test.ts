import { afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ manager: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/beauty-db", () => ({ beautyPrisma: {} }));
vi.mock("@/server/beauty/access", () => ({
  beautyManager: m.manager,
  beautyTransaction: m.transaction,
  beautyMember: vi.fn(),
  beautyWorker: vi.fn(),
  command: vi.fn(),
  audit: vi.fn(),
  requireBeauty: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: vi.fn() }));
vi.mock("@/server/services/trial-booking-chat-link", () => ({
  resolveTrialBookingChatLink: vi.fn(),
}));
vi.mock("@/lib/errors", () => ({
  AppError: class extends Error {
    constructor(code: string, message: string) {
      super(message);
    }
  },
  handleActionError: () => ({ success: false, error: "invalid request" }),
}));
import { saveBeautyCatalog } from "@/server/actions/beauty";
afterEach(() => vi.clearAllMocks());
it.each(["unknown", "TECHNICIAN", ""])(
  "rejects an untrusted catalog selector %s before choosing a weaker permission",
  async (kind) => {
    const result = await saveBeautyCatalog(kind as "technician", {
      name: "不得寫入的技師",
    });
    expect(result.success).toBe(false);
    expect(m.manager).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  },
);
