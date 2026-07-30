export const messengerSelectorCategories = ["BOOKING", "CONTACT_STORE", "MISSING", "OTHER"] as const;
export type MessengerSelectorCategory = typeof messengerSelectorCategories[number];

export const messengerPredictedCompletionTypes = ["URL_BUTTON", "TEXT_ONLY"] as const;
export type MessengerPredictedCompletionType = typeof messengerPredictedCompletionTypes[number];

export const messengerCompletionReasons = [
  "BOOKING_SELECTOR_MATCHED",
  "CONTACT_STORE_SELECTOR_MATCHED",
  "SELECTOR_MISSING",
  "SELECTOR_OTHER",
  "CREATE_LEAD_STEP_MISSING",
  "GENERIC_COMPLETION_SELECTED",
] as const;
export type MessengerCompletionReason = typeof messengerCompletionReasons[number];

type CompletionDiagnosticInput = {
  createLeadStepFound: boolean;
  selectorConfigured: boolean;
  selectorIsSafeChoice: boolean;
  selectorValue?: unknown;
};

export type MessengerCompletionDiagnostic = {
  selectorCategory: MessengerSelectorCategory;
  predictedCompletionType: MessengerPredictedCompletionType;
  completionReason: MessengerCompletionReason;
};

/**
 * Classifies only the supported choice enum. The raw persisted answer is never
 * returned, logged, or copied into an audit record.
 */
export function diagnoseMessengerCompletion(input: CompletionDiagnosticInput): MessengerCompletionDiagnostic {
  if (!input.createLeadStepFound) {
    return {
      selectorCategory: "MISSING",
      predictedCompletionType: "TEXT_ONLY",
      completionReason: "CREATE_LEAD_STEP_MISSING",
    };
  }
  if (!input.selectorConfigured || !input.selectorIsSafeChoice || input.selectorValue === undefined || input.selectorValue === null) {
    return {
      selectorCategory: "MISSING",
      predictedCompletionType: "TEXT_ONLY",
      completionReason: "SELECTOR_MISSING",
    };
  }

  const value = selectorEnumValue(input.selectorValue);
  if (value === "BOOKING") {
    return {
      selectorCategory: "BOOKING",
      predictedCompletionType: "URL_BUTTON",
      completionReason: "BOOKING_SELECTOR_MATCHED",
    };
  }
  if (value === "CONTACT_STORE") {
    return {
      selectorCategory: "CONTACT_STORE",
      predictedCompletionType: "TEXT_ONLY",
      completionReason: "CONTACT_STORE_SELECTOR_MATCHED",
    };
  }
  return {
    selectorCategory: "OTHER",
    predictedCompletionType: "TEXT_ONLY",
    completionReason: "SELECTOR_OTHER",
  };
}

function selectorEnumValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const selected = (value as Record<string, unknown>).value;
  return typeof selected === "string" ? selected : null;
}
