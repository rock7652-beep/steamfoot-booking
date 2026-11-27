import "server-only";
import { listConfirmedMyBookings } from "@/server/queries/liff-my-bookings";
import { aiMemberContext, aiMemberViewKey } from "./member-context";
import { AiToolRegistry } from "./tools";
import { aiMemberArguments, aiMemberDataSchema } from "./member-bookings-contract";

export async function readAiMemberBookings(input: { viewKey: string; date: string; page: number }) {
  const expected = await aiMemberContext();
  if (expected.viewKey !== input.viewKey) throw new Error("AI_MEMBER_SCOPE_CHANGED");
  const registry = new AiToolRegistry();
  registry.register({ name: "my_bookings", module: "STEAMFOOT", mode: "READ", parameters: aiMemberArguments,
    authorize: async scope => {
      const current = await aiMemberContext();
      if (current.viewKey !== expected.viewKey || current.scope.actorId !== scope.actorId || current.scope.storeId !== scope.storeId) throw new Error("AI_MEMBER_SCOPE_CHANGED");
    },
    execute: async (_scope, args) => {
      const result = await listConfirmedMyBookings(aiMemberArguments.parse(args));
      if (aiMemberViewKey(result.identity) !== expected.viewKey) throw new Error("AI_MEMBER_SCOPE_CHANGED");
      if ((await aiMemberContext()).viewKey !== expected.viewKey) throw new Error("AI_MEMBER_SCOPE_CHANGED");
      // Identity metadata stays on the server. The model/UI receive no IDs,
      // customer names, contacts, notes, wallet or financial fields.
      return aiMemberDataSchema.parse({ date: result.date, page: result.page, pageSize: result.pageSize, total: result.total, bookings: result.bookings });
    },
  });
  return registry.invoke(expected.scope, { name: "my_bookings", arguments: { date: input.date, page: input.page } }, "READ_ONLY");
}
