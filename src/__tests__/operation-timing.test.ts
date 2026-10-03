import { expect, it, vi } from "vitest";
import { OperationTiming } from "@/lib/operation-timing";

it("records successful and failed spans without payloads or raw errors", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const timer = new OperationTiming("test");
  expect(await timer.measure("read", async () => "private payload")).toBe("private payload");
  await expect(timer.measure("write", async () => { throw new Error("secret"); })).rejects.toThrow("secret");
  timer.finish();
  const output = JSON.stringify(log.mock.calls);
  expect(output).not.toContain("private payload"); expect(output).not.toContain("secret");
  const result = JSON.parse(log.mock.calls[0][1]);
  expect(result.spans.map((s: { ok: boolean }) => s.ok)).toEqual([true, false]);
  log.mockRestore();
});
