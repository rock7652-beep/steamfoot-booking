import { describe, expect, it } from "vitest";
import { diagnoseMessengerCompletion } from "@/lib/messenger-completion-diagnostic";

const base = { createLeadStepFound: true, selectorConfigured: true, selectorIsSafeChoice: true };

describe("Messenger completion diagnostic", () => {
  it.each([
    ["BOOKING string", "BOOKING", "BOOKING", "URL_BUTTON", "BOOKING_SELECTOR_MATCHED"],
    ["BOOKING object", { value: "BOOKING", label: "預約體驗" }, "BOOKING", "URL_BUTTON", "BOOKING_SELECTOR_MATCHED"],
    ["contact", { value: "CONTACT_STORE", label: "請店家聯絡" }, "CONTACT_STORE", "TEXT_ONLY", "CONTACT_STORE_SELECTOR_MATCHED"],
    ["other", { value: "INFO" }, "OTHER", "TEXT_ONLY", "SELECTOR_OTHER"],
  ] as const)("classifies %s without returning raw values", (_name, selectorValue, selectorCategory, predictedCompletionType, completionReason) => {
    expect(diagnoseMessengerCompletion({ ...base, selectorValue })).toEqual({
      selectorCategory, predictedCompletionType, completionReason,
    });
  });

  it("reports missing selector values and missing CREATE_LEAD steps safely", () => {
    expect(diagnoseMessengerCompletion({ ...base, selectorValue: undefined })).toEqual({
      selectorCategory: "MISSING", predictedCompletionType: "TEXT_ONLY", completionReason: "SELECTOR_MISSING",
    });
    expect(diagnoseMessengerCompletion({ createLeadStepFound: false, selectorConfigured: false, selectorIsSafeChoice: false })).toEqual({
      selectorCategory: "MISSING", predictedCompletionType: "TEXT_ONLY", completionReason: "CREATE_LEAD_STEP_MISSING",
    });
  });
});
