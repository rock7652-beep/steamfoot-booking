export type SpaBookingTreatment = {
  id: string;
  name: string;
  variantLabel: string | null;
  price: number;
  serviceMinutes: number;
  bufferMinutes: number;
  skillKeys: readonly string[];
};

export type SpaBookingComposition = {
  treatmentIds: string[];
  displayName: string;
  totalPrice: number;
  serviceMinutes: number;
  bufferMinutes: number;
  occupiedMinutes: number;
  requiredSkillKeys: string[];
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

  const serviceMinutes = treatments.reduce(
    (sum, treatment) => sum + treatment.serviceMinutes,
    0,
  );
  const bufferMinutes = treatments.reduce(
    (sum, treatment) => sum + treatment.bufferMinutes,
    0,
  );

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
  };
}
