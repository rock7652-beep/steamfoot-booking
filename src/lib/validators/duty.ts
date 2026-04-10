import { z } from "zod";

export const dutyAssignmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/),
  staffId: z.string().min(1),
  dutyRole: z.enum(["STORE_MANAGER", "BRANCH_MANAGER", "INTERN_COACH", "HOURLY_STAFF"]),
  participationType: z.enum(["PRIMARY", "ASSIST", "SHADOW", "SUPPORT"]),
  notes: z.string().max(200).optional(),
});

export const batchCreateDutySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
  staffId: z.string().min(1),
  dutyRole: z.enum(["STORE_MANAGER", "BRANCH_MANAGER", "INTERN_COACH", "HOURLY_STAFF"]),
  participationType: z.enum(["PRIMARY", "ASSIST", "SHADOW", "SUPPORT"]),
});

export const copySlotToAllSlotsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceSlotTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const copyFromPreviousBusinessDaySchema = z.object({
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const copyToWeekDatesSchema = z.object({
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
});
