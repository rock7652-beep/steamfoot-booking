import { z } from "zod";

export const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(["TRIAL", "SINGLE", "PACKAGE"]),
  price: z.number().int().min(0),
  sessionCount: z.number().int().min(1),
  validityDays: z.number().int().min(1).optional(),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().optional(),
});

export const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  price: z.number().int().min(0).optional(),
  sessionCount: z.number().int().min(1).optional(),
  validityDays: z.number().int().min(1).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const assignPlanSchema = z.object({
  customerId: z.string().cuid(),
  planId: z.string().cuid(),
  paymentMethod: z.enum(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER"]),
  note: z.string().max(500).optional(),
});
