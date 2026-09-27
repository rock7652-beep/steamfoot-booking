import { expect, it, vi } from "vitest";
import { dispatchBookingBatch } from "@/lib/booking-action-batch";

it("registers every row before sending and preserves partial success and failure", async () => {
  const registered: string[] = [];
  const send = vi.fn(async () => {
    expect(registered).toEqual(["a", "b", "c"]);
    return { results: [{ id: "a", success: true }, { id: "b", success: false, error: "不可修改" }] };
  });
  const sent = vi.fn();
  const result = await dispatchBookingBatch(["a", "b", "c"], send, async (id, action) => {
    registered.push(id);
    try { return await action(); } catch { return { unknown: id }; }
  }, sent);
  expect(result).toEqual([{ id: "a", success: true }, { id: "b", success: false, error: "不可修改" }, { unknown: "c" }]);
  expect(send).toHaveBeenCalledOnce();
  expect(sent).toHaveBeenCalledOnce();
});

it("routes all lost-response rows to recovery without sending a second batch", async () => {
  const send = vi.fn(async () => { throw Error("offline"); });
  const recovered: string[] = [];
  const outcomes = await dispatchBookingBatch(["a", "b"], send, async (id, action) => {
    try { await action(); return "saved"; } catch { recovered.push(id); return "unknown"; }
  }, () => {});
  expect(outcomes).toEqual(["unknown", "unknown"]);
  expect(recovered).toEqual(["a", "b"]);
  expect(send).toHaveBeenCalledOnce();
});

it("treats duplicate row results as ambiguous", async () => {
  const result = await dispatchBookingBatch(["a"], async () => ({ results: [{ id: "a", success: true }, { id: "a", success: false }] }), async (_id, action) => {
    try { await action(); return "saved"; } catch { return "unknown"; }
  }, () => {});
  expect(result).toEqual(["unknown"]);
});
