import { z } from "zod";

export const createBookingSchema = z.object({
  customerId: z.string().cuid(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/),
  bookingType: z.enum(["FIRST_TRIAL", "SINGLE", "PACKAGE_SESSION"]),
  servicePlanId: z.string().cuid().optional(),
  customerPlanWalletId: z.string().cuid().optional(),
  people: z.number().int().min(1).max(4).optional(),
  isMakeup: z.boolean().optional(),
  makeupCreditId: z.string().cuid().optional(),
  notes: z.string().max(500).optional(),
  skipDutyCheck: z.boolean().optional(), // OWNER 可略過值班檢查
});

export const updateBookingSchema = z.object({
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  people: z.number().int().min(1).max(4).optional(),
  serviceStaffId: z.string().cuid().optional(),
  notes: z.string().max(500).optional(),
});

export const completeBookingSchema = z.object({
  serviceStaffId: z.string().cuid().optional(),
});
