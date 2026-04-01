import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(8).max(20),
  lineName: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  assignedStaffId: z.string().cuid().optional(), // Owner 可指定，Manager 自動填自己
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().min(8).max(20).optional(),
  lineName: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  customerStage: z.enum(["LEAD", "TRIAL", "ACTIVE", "INACTIVE"]).optional(),
  selfBookingEnabled: z.boolean().optional(),
});

export const transferCustomerSchema = z.object({
  customerId: z.string().cuid(),
  newStaffId: z.string().cuid(),
});
