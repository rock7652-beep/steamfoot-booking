import { z } from "zod";
export const aiMemberArguments = z.object({ date: z.string().date(), page: z.number().int().min(1).max(1000) }).strict();
export const aiMemberReadSchema = aiMemberArguments.extend({ viewKey: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const aiMemberDataSchema = z.object({
  date: z.string().date(), page: z.number().int().min(1), pageSize: z.literal(25), total: z.number().int().nonnegative(),
  bookings: z.array(z.object({ date: z.string().date(), time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]), people: z.number().int().positive() }).strict()).max(25),
}).strict();
export const aiMemberResponseSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), snapshot: aiMemberDataSchema.extend({ viewKey: z.string(), checkedAtLabel: z.string() }).strict() }).strict(),
  z.object({ success: z.literal(false), error: z.string().max(200) }).strict(),
]);
export type AiMemberResponse = z.infer<typeof aiMemberResponseSchema>;
