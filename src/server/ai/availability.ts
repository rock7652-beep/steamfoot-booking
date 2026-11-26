import "server-only";
import { z } from "zod";
import { toLocalDateStr } from "@/lib/date-utils";
import { fetchDaySlots } from "@/server/actions/slots";
import { AiToolRegistry } from "./tools";
import { aiAvailabilityArguments } from "./availability-contract";
import type { TrustedAiScope } from "./service";

const slotSchema = z.object({
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  available: z.number().int().nonnegative(), isEnabled: z.boolean(), isPast: z.boolean(),
});
/** One read adapter. It projects public availability, never customer rows or
 * staff availability, and does not install tools into the knowledge provider. */
export function aiAvailabilityRegistry(authorize: (scope: TrustedAiScope) => Promise<void>) {
  const registry = new AiToolRegistry();
  registry.register({ name: "steam_available_slots", module: "STEAMFOOT", mode: "READ", parameters: aiAvailabilityArguments, authorize,
    execute: async (scope, input) => {
      const { date } = aiAvailabilityArguments.parse(input);
      if (date < toLocalDateStr()) throw new Error("AI_AVAILABILITY_DATE_PAST");
      const result = await fetchDaySlots(date, scope.storeId, { customerView: true });
      const slots = z.array(slotSchema).max(1440).parse(result.slots);
      return { date, slots: slots.filter(s => s.isEnabled && !s.isPast && s.available > 0)
        .map(s => ({ startTime: s.startTime, remaining: s.available })) };
    },
  });
  return registry;
}
