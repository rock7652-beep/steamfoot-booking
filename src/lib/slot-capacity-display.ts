/**
 * UI-only slot capacity presentation. Server-side booking validation remains
 * authoritative; this helper deliberately has no database or session access.
 */
export type CapacityDisplayStatus = "available" | "low" | "full";
export type SlotSelectionStatus = CapacityDisplayStatus | "insufficient";

export type SlotCapacityDisplay = {
  remainingCapacity: number;
  /** Capacity band, independent from the size of the current booking. */
  capacityStatus: CapacityDisplayStatus;
  /** Whether this particular requested party can select the slot. */
  selectionStatus: SlotSelectionStatus;
  canFitRequestedPeople: boolean;
  label: string | null;
};

export type CapacitySlot = {
  capacity: number;
  bookedPeople: number;
};

/**
 * Keep scarcity presentation separate from whether the selected party fits.
 * An available-but-too-small slot is intentionally grey and unselectable.
 */
export function getSlotCapacityDisplay(
  capacity: number,
  bookedPeople: number,
  requestedPeople = 1,
): SlotCapacityDisplay {
  const remainingCapacity = capacity - bookedPeople;

  if (remainingCapacity <= 0) {
    return {
      remainingCapacity,
      capacityStatus: "full",
      selectionStatus: "full",
      canFitRequestedPeople: false,
      label: "已額滿",
    };
  }

  const capacityStatus: CapacityDisplayStatus = remainingCapacity <= 2 ? "low" : "available";
  if (remainingCapacity < requestedPeople) {
    return {
      remainingCapacity,
      capacityStatus,
      selectionStatus: "insufficient",
      canFitRequestedPeople: false,
      label: "不可預約",
    };
  }

  return {
    remainingCapacity,
    capacityStatus,
    selectionStatus: capacityStatus,
    canFitRequestedPeople: true,
    label: remainingCapacity === 2 ? "剩餘 2 位" : remainingCapacity === 1 ? "僅剩 1 位" : null,
  };
}

/** Aggregate the best selectable capacity band for a calendar day. */
export function getDayCapacityIndicator(
  slots: readonly CapacitySlot[],
  requestedPeople = 1,
): CapacityDisplayStatus | null {
  const activeSlots = slots.filter((slot) => slot.capacity > 0);
  if (activeSlots.length === 0) return null;

  const displays = activeSlots.map((slot) =>
    getSlotCapacityDisplay(slot.capacity, slot.bookedPeople, requestedPeople),
  );
  if (displays.some((display) => display.canFitRequestedPeople && display.capacityStatus === "available")) {
    return "available";
  }
  if (displays.some((display) => display.canFitRequestedPeople && display.capacityStatus === "low")) {
    return "low";
  }
  return "full";
}
