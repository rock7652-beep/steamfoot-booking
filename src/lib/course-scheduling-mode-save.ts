import { z } from "zod";
import { selfBookingReceipt } from "./course-self-booking-save";
export const schedulingModeInput = selfBookingReceipt.extend({ mode: z.enum(["OPEN", "ASSIGNED"]), enabled: z.boolean() }).strict();
export const savedSchedulingModes = z.object({ open: z.boolean(), assigned: z.boolean(), revision: z.number().int().min(0) });
