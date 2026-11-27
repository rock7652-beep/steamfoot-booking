import { expect, it, vi } from "vitest";
import { z } from "zod";
import { AiToolRegistry } from "@/server/ai/tools";
const scope = { storeId: "a", channel: "TEST" as const, channelAccountId: "test", actorId: "verified", module: "STEAMFOOT" as const };
it("knowledge phase has no executable tools; future read tools require trusted scope and authorization", async () => {
  const registry = new AiToolRegistry(), execute = vi.fn(async () => ({ slots: [] })), authorize = vi.fn(async () => {});
  registry.register({ name: "available_slots", mode: "READ", module: "STEAMFOOT", parameters: z.object({ date: z.string() }).strict(), execute, authorize });
  const request = { name: "available_slots", arguments: { date: "2026-11-25" } };
  await expect(registry.invoke(scope, request, "KNOWLEDGE")).rejects.toThrow("AI_TOOLS_DISABLED");
  await expect(registry.invoke(scope, request, "WRITE" as "READ_ONLY")).rejects.toThrow("AI_TOOLS_DISABLED");
  await expect(registry.invoke(scope, { ...request, arguments: { storeId: "b" } }, "READ_ONLY")).rejects.toThrow("AI_TOOL_SCOPE_FORBIDDEN");
  await expect(registry.invoke({ ...scope, module: "MUSIC" }, request, "READ_ONLY")).rejects.toThrow("AI_TOOL_NOT_AUTHORIZED");
  await expect(registry.invoke(scope, { name: "refund", arguments: {} }, "READ_ONLY")).rejects.toThrow("AI_TOOL_NOT_AUTHORIZED");
  expect(execute).not.toHaveBeenCalled();
  await expect(registry.invoke(scope, request, "READ_ONLY")).resolves.toEqual({ slots: [] });
  expect(authorize).toHaveBeenCalledWith(scope); expect(execute).toHaveBeenCalledWith(scope, { date: "2026-11-25" });
});
it("captures immutable scope before asynchronous authorization", async () => {
  const mutable = { ...scope }, registry = new AiToolRegistry(), execute = vi.fn(async (s: { storeId: string }) => s.storeId);
  registry.register({ name: "available_slots", mode: "READ", module: "STEAMFOOT", parameters: z.object({}).strict(),
    authorize: async captured => { expect(Object.isFrozen(captured)).toBe(true); mutable.storeId = "foreign"; }, execute });
  await expect(registry.invoke(mutable, { name: "available_slots", arguments: {} }, "READ_ONLY")).resolves.toBe("a");
  expect(execute.mock.calls[0][0].storeId).toBe("a");
});
