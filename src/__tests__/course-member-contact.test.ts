import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ member: vi.fn(), update: vi.fn(), refresh: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseMember: mocks.member }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { updateMany: mocks.update } } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
import { saveCourseMemberContact } from "@/server/actions/course-member-contact";
import { AppError } from "@/lib/errors";
beforeEach(() => {
  vi.clearAllMocks(); mocks.member.mockResolvedValue({ storeId: "store-a", customer: { id: "member-a" } });
  mocks.update.mockResolvedValue({ count: 1 });
});
describe("member emergency contact scope", () => {
  it("always updates the authenticated store member, ignoring requested shared-card identities", async () => {
    expect(await saveCourseMemberContact({ customerId: "member-b", storeId: "store-b", emergencyContactName: " 家人 ", emergencyContactPhone: " 0912345678 " })).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "member-a", storeId: "store-a", mergedIntoCustomerId: null },
      data: { emergencyContactName: "家人", emergencyContactPhone: "0912345678" },
    });
  });
  it("supports clearing only the two contact fields", async () => {
    await saveCourseMemberContact({ emergencyContactName: "", emergencyContactPhone: "" });
    expect(mocks.update.mock.calls[0][0].data).toEqual({ emergencyContactName: null, emergencyContactPhone: null });
  });
  it("does not write when member access is disabled", async () => {
    mocks.member.mockRejectedValue(new AppError("FORBIDDEN", "會員身分停用"));
    expect(await saveCourseMemberContact({ emergencyContactName: "家人", emergencyContactPhone: "0912345678" })).toMatchObject({ success: false });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not recreate a missing customer", async () => {
    mocks.update.mockResolvedValue({ count: 0 });
    expect(await saveCourseMemberContact({ emergencyContactName: "家人", emergencyContactPhone: "0912345678" })).toMatchObject({ success: false });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
