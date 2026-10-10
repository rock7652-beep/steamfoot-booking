import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), upsert: vi.fn(), revalidate: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireStaffSession: m.session }));
vi.mock("@/lib/db", () => ({ prisma: { todoDismiss: { upsert: m.upsert } } }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/errors", () => ({ handleActionError: m.error }));
import { dismissTodo } from "@/server/actions/todo-dismiss";

const input = { todoKey: "followup:customer-a:2026-09-01", todoType: "FOLLOW_UP" };
beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ id: "user-a", storeId: "store-a" });
  m.upsert.mockResolvedValue({});
  m.error.mockReturnValue({ success: false, error: "無法儲存" });
});
describe("todo dismissal preserves server persistence boundaries", () => {
  it("keeps the exact state key and writes only an idempotent per-user dismissal", async () => {
    expect(await dismissTodo(input)).toEqual({ success: true, data: undefined });
    expect(m.session).toHaveBeenCalledOnce();
    expect(m.upsert).toHaveBeenCalledExactlyOnceWith({
      where: { userId_todoKey: { userId: "user-a", todoKey: input.todoKey } },
      create: { userId: "user-a", storeId: "store-a", ...input }, update: {},
    });
    expect(m.revalidate).toHaveBeenCalledExactlyOnceWith("/dashboard");
  });
  it("derives a different user's identity from their session, never client input", async () => {
    await dismissTodo(input);
    m.session.mockResolvedValue({ id: "user-b", storeId: "store-a" });
    await dismissTodo(input);
    expect(m.upsert.mock.calls[1][0].where.userId_todoKey).toEqual({ userId: "user-b", todoKey: input.todoKey });
  });
  it("returns persistence errors for row rollback and does not revalidate a failed write", async () => {
    m.upsert.mockRejectedValue(new Error("write failed"));
    expect(await dismissTodo(input)).toEqual({ success: false, error: "無法儲存" });
    expect(m.revalidate).not.toHaveBeenCalled();
  });
  it("rejects expired sessions before any write", async () => {
    m.session.mockRejectedValue(new Error("expired session"));
    expect((await dismissTodo(input)).success).toBe(false);
    expect(m.upsert).not.toHaveBeenCalled(); expect(m.revalidate).not.toHaveBeenCalled();
  });
  it.each([{ todoKey: "", todoType: "FOLLOW_UP" }, { ...input, todoType: "UNKNOWN" }])("preserves input validation", async invalid => {
    expect((await dismissTodo(invalid)).success).toBe(false); expect(m.upsert).not.toHaveBeenCalled();
  });
});
