import { getSlotCapacityDisplay } from "@/lib/slot-capacity-display";
import type { SlotAvailability } from "@/types";

export type MemberBookingNextSelection = {
  slotTime: string;
  people: number;
};

const SLOT_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function parseMemberBookingNextSelection(
  search: string,
): MemberBookingNextSelection | null {
  const params = new URLSearchParams(search);
  const slotTime = params.get("preferredSlot");
  const people = Number(params.get("people"));

  if (
    !slotTime ||
    !SLOT_TIME_PATTERN.test(slotTime) ||
    !Number.isInteger(people) ||
    people < 1 ||
    people > 4
  ) {
    return null;
  }

  return { slotTime, people };
}

export function buildMemberBookingNextPath(
  storeSlug: string,
  selection: MemberBookingNextSelection,
): string {
  const params = new URLSearchParams({
    preferredSlot: selection.slotTime,
    people: String(selection.people),
  });
  return `/s/${storeSlug}/liff/member-booking?${params.toString()}`;
}

export function findPreferredMemberBookingSlot(
  slots: readonly SlotAvailability[],
  preferredSlot: string,
  requestedPeople: number,
): string | null {
  const slot = slots.find((candidate) => candidate.startTime === preferredSlot);
  if (!slot || slot.isPast === true || !slot.isEnabled) return null;

  const display = getSlotCapacityDisplay(
    slot.capacity,
    slot.bookedCount,
    requestedPeople,
  );
  return display.canFitRequestedPeople ? slot.startTime : null;
}
