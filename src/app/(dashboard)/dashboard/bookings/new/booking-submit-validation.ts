import type { SlotAvailability } from "@/types";

export type BookingSubmitErrors = {
  customer?: "請從搜尋結果中選擇顧客";
  treatment?: "請至少選擇一項本次服務";
  slot?: "請選擇預約時段";
};

export function getBookingSubmitErrors({
  customerId,
  slotTime,
  spaMode,
  treatmentIds = [],
}: {
  customerId: FormDataEntryValue | null;
  slotTime: FormDataEntryValue | null;
  spaMode?: FormDataEntryValue | null;
  treatmentIds?: FormDataEntryValue[];
}): BookingSubmitErrors {
  const errors: BookingSubmitErrors = {};
  if (!customerId) errors.customer = "請從搜尋結果中選擇顧客";
  if (spaMode && treatmentIds.length === 0) {
    errors.treatment = "請至少選擇一項本次服務";
  }
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
