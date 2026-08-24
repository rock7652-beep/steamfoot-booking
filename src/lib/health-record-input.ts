import { z } from "zod";

const optionalMetric = (label: string, min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value == null ? null : Number(value)),
    z
      .number({ invalid_type_error: `${label}格式不正確` })
      .finite(`${label}格式不正確`)
      .min(min, `${label}不可低於 ${min}`)
      .max(max, `${label}不可高於 ${max}`)
      .nullable(),
  );

export const healthRecordInputSchema = z
  .object({
    requestId: z.string().uuid("請重新整理頁面後再試"),
    measuredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "量測日期格式不正確"),
    weight: optionalMetric("體重", 20, 300),
    bmi: optionalMetric("BMI", 5, 100),
    bodyFat: optionalMetric("體脂肪", 1, 70),
    muscleMass: optionalMetric("肌肉量", 5, 80),
    boneMass: optionalMetric("骨量", 0.5, 8),
    visceralFat: optionalMetric("內臟脂肪", 1, 60),
    bmr: optionalMetric("基礎代謝", 200, 5000),
    bodyWater: optionalMetric("體水分", 10, 90),
    metabolicAge: optionalMetric("體內年齡", 5, 120),
    note: z.string().trim().max(500, "備註不可超過 500 字").nullable(),
  })
  .superRefine((value, ctx) => {
    const hasMetric = [
      value.weight,
      value.bmi,
      value.bodyFat,
      value.muscleMass,
      value.boneMass,
      value.visceralFat,
      value.bmr,
      value.bodyWater,
      value.metabolicAge,
    ].some((metric) => metric != null);

    if (!hasMetric) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weight"],
        message: "請至少填寫一項量測數值",
      });
    }
  });

export type HealthRecordInput = z.infer<typeof healthRecordInputSchema>;

export function healthRecordFormData(formData: FormData) {
  return {
    requestId: formData.get("requestId"),
    measuredAt: formData.get("measuredAt"),
    weight: formData.get("weight"),
    bmi: formData.get("bmi"),
    bodyFat: formData.get("bodyFat"),
    muscleMass: formData.get("muscleMass"),
    boneMass: formData.get("boneMass"),
    visceralFat: formData.get("visceralFat"),
    bmr: formData.get("bmr"),
    bodyWater: formData.get("bodyWater"),
    metabolicAge: formData.get("metabolicAge"),
    note: formData.get("note") || null,
  };
}
