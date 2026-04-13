import { z } from "zod";

export const updateTalentStageSchema = z.object({
  customerId: z.string().min(1),
  newStage: z.enum([
    "CUSTOMER",
    "REGULAR",
    "POTENTIAL_PARTNER",
    "PARTNER",
    "FUTURE_OWNER",
    "OWNER",
  ]),
  note: z.string().max(500).optional(),
});

export const setSponsorSchema = z.object({
  customerId: z.string().min(1),
  sponsorId: z.string().min(1).nullable(),
});
