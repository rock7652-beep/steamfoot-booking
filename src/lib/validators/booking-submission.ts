import { z } from "zod";

export const bookingSubmissionRequestKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "invalid_request_key");

export const bookingSubmissionSourceSchema = z.string().trim().min(1).max(32);
