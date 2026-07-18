import type { SlotAvailability } from "@/types";

export type BookingSubmitErrors = {
  customer?: "請從搜尋結果中選擇顧客";
  slot?: "請選擇預約時段";
};

export function getBookingSubmitErrors({
  customerId,
  slotTime,
}: {
  customerId: FormDataEntryValue | null;
  slotTime: FormDataEntryValue | null;
}): BookingSubmitErrors {
  const errors: BookingSubmitErrors = {};
  if (!customerId) errors.customer = "請從搜尋結果中選擇顧客";
  if (!slotTime) errors.slot = "請選擇預約時段";
  return errors;
}

export function shouldClearSelectedSlot(
  selectedSlot: string | null,
  slots: SlotAvailability[],
  people: number,
): boolean {
  if (!selectedSlot) return false;
  const slot = slots.find((candidate) => candidate.startTime === selectedSlot);
  return !slot || slot.available < people;
}
