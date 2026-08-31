"use server";

import { z } from "zod";
import { createBooking } from "@/server/actions/booking";
import { createCustomer } from "@/server/actions/customer";
import { requireWritablePermission } from "@/lib/permissions";
import { currentStoreId } from "@/lib/store";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { handleActionError } from "@/lib/errors";
import { revalidatePath } from "next/cache";

const inputSchema = z.object({
  customerId: z.string().min(1).optional(),
  newCustomer: z.object({
    name: z.string().trim().min(1).max(100),
    phone: z.string().trim().regex(/^09\d{8}$/),
  }).optional(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/),
  serviceStaffId: z.string().min(1),
  treatmentIds: z.array(z.string().min(1)).min(1).max(8),
  notes: z.string().trim().max(500).optional(),
  requestKey: z.string().min(8).max(100),
}).refine((value) => !!value.customerId !== !!value.newCustomer, {
  message: "請選擇既有顧客，或建立一位新顧客",
});

export type SpaQuickBookingInput = z.infer<typeof inputSchema>;

export type SpaQuickBookingResult =
  | { success: true; data: { bookingId: string; customerId: string } }
  | { success: false; error: string; customerId?: string };

export async function createSpaQuickBooking(
  input: SpaQuickBookingInput,
): Promise<SpaQuickBookingResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "預約資料不完整" };
  }

  try {
    const user = await requireWritablePermission("booking.create");
    if (currentStoreId(user) !== SPA_DEMO_STORE.id) {
      return { success: false, error: "快速排預約目前只開放 SPA Demo 驗收" };
    }

    const data = parsed.data;
    let customerId = data.customerId;
    if (!customerId && data.newCustomer) {
      const customer = await createCustomer({
        name: data.newCustomer.name,
        phone: data.newCustomer.phone,
      });
      if (!customer.success) {
        return { success: false, error: customer.error };
      }
      customerId = customer.data.customerId;
    }

    if (!customerId) return { success: false, error: "請選擇顧客" };

    const booking = await createBooking(
      {
        customerId,
        bookingDate: data.bookingDate,
        slotTime: data.slotTime,
        bookingType: "SINGLE",
        people: 1,
        serviceStaffId: data.serviceStaffId,
        treatmentIds: data.treatmentIds,
        notes: data.notes || undefined,
      },
      {
        requestKey: data.requestKey,
        source: "spa-quick-booking",
        assignedStaffId: data.serviceStaffId,
      },
    );

    if (!booking.success) {
      return { success: false, error: booking.error, customerId };
    }
    revalidatePath("/dashboard/spa-schedule");
    return {
      success: true,
      data: { bookingId: booking.data.bookingId, customerId },
    };
  } catch (error) {
    return handleActionError(error);
  }
}
