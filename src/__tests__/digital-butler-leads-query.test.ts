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

  it("limits the support queue to unassigned NEW human-support leads in the active store", async () => {
    await listDigitalButlerLeads("store-a", { unassignedHumanSupport: true });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: "store-a",
        completionActionKey: "__human_support_handoff__",
        status: "NEW",
        assignedStaffId: null,
      }),
    }));
  });

  it("opens an individual deep-linked lead without dropping store isolation", async () => {
    await listDigitalButlerLeads("store-a", { leadId: "lead-a" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store-a", id: "lead-a" }),
    }));
  });
});
