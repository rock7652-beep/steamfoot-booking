import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().max(20).optional().default(""), // 可為空（Google 登入時）
  email: z.string().email().max(200).optional(),
  lineName: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  assignedStaffId: z.string().cuid().optional(), // 選填，可稍後指派
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().max(200).nullable().optional(),
  lineName: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  gender: z.string().max(10).nullable().optional(),
  birthday: z.string().nullable().optional(), // ISO date string, converted to Date in action
  height: z.number().min(50).max(250).nullable().optional(),
  customerStage: z.enum(["LEAD", "TRIAL", "ACTIVE", "INACTIVE"]).optional(),
  selfBookingEnabled: z.boolean().optional(),
  assignedStaffId: z.string().cuid().nullable().optional(),
});

export const transferCustomerSchema = z.object({
  customerId: z.string().cuid(),
  newStaffId: z.string().cuid(),
});
