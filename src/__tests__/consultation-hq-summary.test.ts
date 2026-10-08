import { describe, expect, it } from "vitest";
import { intakeTestMarker, consultationNextStep } from "@/app/hq/dashboard/trial-applications/intake-summary";
describe("explicit intake test markers", () => {
  it.each(["【HQ測試】合成店家", "QA_URL_ONLY_20990101", "TEST-DO-NOT-CONTACT", "SYSTEM_QA_DO_NOT_CONTACT", "非店家申請"])("marks an explicit operational marker: %s", marker => expect(intakeTestMarker(marker)).toBe(true));
  it("does not classify a normal store, ordinary phone or common name as test data", () => {
    expect(intakeTestMarker("合成材料工作室", "一般聯絡人", "0912345678")).toBe(false);
    expect(intakeTestMarker("品質測試顧問公司")).toBe(false);
  });
  it("preserves explicit no-contact and closed-record guidance", () => {
    expect(consultationNextStep("NEW", true, false)).toBe("請勿主動聯繫");
    expect(consultationNextStep("CLOSED", false, true)).toBe("已結案，保留紀錄");
  });
});
