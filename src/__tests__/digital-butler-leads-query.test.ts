import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { digitalButlerLead: { findMany } },
}));
vi.mock("@/lib/digital-butler-entitlement", () => ({
  requireDigitalButlerEntitlement: vi.fn(),
}));

import { listDigitalButlerLeads } from "@/server/queries/digital-butler-leads";

const HUMAN_SUPPORT_COMPLETION_ACTION_KEY = "__human_support_handoff__";

describe("Digital Butler lead source filters", () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it("combines Messenger with existing status and assignee filters", async () => {
    await listDigitalButlerLeads("store-a", {
      status: "NEW",
      assignedStaffId: "staff-a",
      provider: "MESSENGER",
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: "store-a",
        status: "NEW",
        assignedStaffId: "staff-a",
        conversation: { provider: "MESSENGER" },
      }),
    }));
  });

  it("uses the existing conversation provider field for LINE", async () => {
    await listDigitalButlerLeads("store-a", { provider: "LINE" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ conversation: { provider: "LINE" } }),
    }));
  });

  it("limits the waiting-support view to unassigned NEW human-support leads in the active store", async () => {
    await listDigitalButlerLeads("store-a", { waitingForHumanSupport: true });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: "store-a",
        completionActionKey: HUMAN_SUPPORT_COMPLETION_ACTION_KEY,
        status: "NEW",
        assignedStaffId: null,
      }),
    }));
  });

  it("derives a bounded legacy handoff reference without exposing the sender hash", async () => {
    const senderIdHash = "0123456789abcdef0123456789abcdef";
    findMany.mockResolvedValueOnce([
      {
        id: "lead-a",
        status: "NEW",
        completionActionKey: HUMAN_SUPPORT_COMPLETION_ACTION_KEY,
        submittedAnswers: { requestType: "HUMAN_SUPPORT", provider: "LINE" },
        customerDisplayName: null,
        customerAvatarUrl: null,
        customerReference: null,
        lastMessageCiphertext: null,
        lastMessageIv: null,
        lastMessageAuthTag: null,
        lastMessageAt: null,
        phoneCiphertext: null,
        phoneIv: null,
        phoneAuthTag: null,
        internalNote: null,
        lastContactedAt: null,
        createdAt: new Date("2026-07-31T00:00:00.000Z"),
        updatedAt: new Date("2026-07-31T00:00:00.000Z"),
        flow: { name: "客服流程" },
        conversation: { provider: "LINE", senderIdHash },
        assignedStaff: null,
        activities: [],
      },
    ]);

    const [lead] = await listDigitalButlerLeads("store-a", { waitingForHumanSupport: true });

    expect(lead.customerReference).toBe("客服-01234567");
    expect(lead.conversation).toEqual({ provider: "LINE" });
    expect(lead).not.toHaveProperty("completionActionKey");
    expect(lead).not.toHaveProperty("phoneCiphertext");
    expect(lead).not.toHaveProperty("lastMessageCiphertext");
    expect(JSON.stringify(lead)).not.toContain(senderIdHash);
  });
});
