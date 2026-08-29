export type SpaBookingTreatment = {
  id: string;
  name: string;
  variantLabel: string | null;
  price: number;
  serviceMinutes: number;
  bufferMinutes: number;
  skillKeys: readonly string[];
  kind?: "SERVICE" | "COMBO" | "ADD_ON";
  resourceType?: "BED" | "CHAIR";
};

export type SpaBookingComposition = {
  treatmentIds: string[];
  displayName: string;
  totalPrice: number;
  serviceMinutes: number;
  bufferMinutes: number;
  occupiedMinutes: number;
  requiredSkillKeys: string[];
  resourceType: "BED" | "CHAIR";
};

/**
 * A SPA booking is composed from the services performed in this visit. Payment
 * entitlements (package sessions / stored value) are intentionally absent.
 */
export function composeSpaBookingTreatments(
  treatments: readonly SpaBookingTreatment[],
): SpaBookingComposition {
  if (treatments.length === 0) throw new Error("請至少選擇一項服務");

  const uniqueIds = new Set(treatments.map((treatment) => treatment.id));
  if (uniqueIds.size !== treatments.length) throw new Error("服務項目不可重複選擇");

  const mainServices = treatments.filter((treatment) => treatment.kind !== "ADD_ON");
  if (mainServices.length !== 1) {
    throw new Error("請選擇一個主要服務或固定套餐");
  }

  const serviceMinutes = treatments.reduce(
    (sum, treatment) => sum + treatment.serviceMinutes,
    0,
  );
  // One continuous visit only needs one post-service cleanup window. Taking
  // the longest configured cleanup prevents add-ons from stacking buffers.
  const bufferMinutes = Math.max(...treatments.map((treatment) => treatment.bufferMinutes));

  return {
    treatmentIds: treatments.map((treatment) => treatment.id),
    displayName: treatments
      .map((treatment) =>
        [treatment.name, treatment.variantLabel].filter(Boolean).join(" "),
      )
      .join("＋"),
    totalPrice: treatments.reduce((sum, treatment) => sum + treatment.price, 0),
    serviceMinutes,
    bufferMinutes,
    occupiedMinutes: serviceMinutes + bufferMinutes,
    requiredSkillKeys: [
      ...new Set(treatments.flatMap((treatment) => treatment.skillKeys)),
    ],
    resourceType: mainServices[0].resourceType ?? "BED",
  };
}
