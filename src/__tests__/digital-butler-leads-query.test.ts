import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, findFirst } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { digitalButlerLead: { findMany, findFirst } },
}));
vi.mock("@/lib/digital-butler-entitlement", () => ({
  requireDigitalButlerEntitlement: vi.fn(),
}));

import { listDigitalButlerLeads } from "@/server/queries/digital-butler-leads";

const HUMAN_SUPPORT_COMPLETION_ACTION_KEY = "__human_support_handoff__";

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-a",
    status: "NEW",
    completionActionKey: "create-lead",
    submittedAnswers: {},
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
    conversation: { provider: "LINE", senderIdHash: "0123456789abcdef0123456789abcdef" },
    assignedStaff: null,
    activities: [],
    ...overrides,
  };
}

describe("Digital Butler lead source filters", () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
    findFirst.mockReset();
    findFirst.mockResolvedValue(null);
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
    findMany.mockResolvedValueOnce([leadRow({
      completionActionKey: HUMAN_SUPPORT_COMPLETION_ACTION_KEY,
      submittedAnswers: { requestType: "HUMAN_SUPPORT", provider: "LINE" },
      conversation: { provider: "LINE", senderIdHash },
    })]);

    const [lead] = await listDigitalButlerLeads("store-a", { waitingForHumanSupport: true });

    expect(lead.isHumanSupportHandoff).toBe(true);
    expect(lead.customerReference).toBe("客服-01234567");
    expect(lead.conversation).toEqual({ provider: "LINE" });
    expect(lead).not.toHaveProperty("completionActionKey");
    expect(lead).not.toHaveProperty("phoneCiphertext");
    expect(lead).not.toHaveProperty("lastMessageCiphertext");
    expect(JSON.stringify(lead)).not.toContain(senderIdHash);
  });

  it("marks a normal lead as non-handoff even when its answer requests human support", async () => {
    findMany.mockResolvedValueOnce([leadRow({
      completionActionKey: "create-lead",
      submittedAnswers: { name: "黃彥陸", requestType: "HUMAN_SUPPORT" },
    })]);

    const [lead] = await listDigitalButlerLeads("store-a");

    expect(lead.isHumanSupportHandoff).toBe(false);
    expect(lead.submittedAnswers).toEqual({ name: "黃彥陸", requestType: "HUMAN_SUPPORT" });
    expect(lead).not.toHaveProperty("completionActionKey");
  });

  it("includes a store-scoped focused lead when it falls outside the 200-row list", async () => {
    const focused = leadRow({ id: "lead-old" });
    findMany.mockResolvedValueOnce([leadRow({ id: "lead-new" })]);
    findFirst.mockResolvedValueOnce(focused);

    const leads = await listDigitalButlerLeads("store-a", { focusedLeadId: "lead-old" });

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lead-old", storeId: "store-a" },
    }));
    expect(leads.map((lead) => lead.id)).toEqual(["lead-old", "lead-new"]);
  });
});
