import type { TrendPoint } from "@/lib/health-service";

export type HealthDisplayMetric = {
  key: Exclude<keyof TrendPoint, "measuredAt">;
  label: string;
  unit: string;
};

export const HEALTH_DISPLAY_METRICS: HealthDisplayMetric[] = [
  { key: "weight", label: "體重", unit: "kg" },
  { key: "bmi", label: "BMI", unit: "" },
  { key: "bodyFat", label: "體脂肪", unit: "%" },
  { key: "muscleMass", label: "肌肉量", unit: "kg" },
  { key: "boneMass", label: "骨量", unit: "kg" },
  { key: "visceralFat", label: "內臟脂肪", unit: "" },
  { key: "bmr", label: "基礎代謝", unit: "kcal" },
  { key: "bodyWater", label: "體水分", unit: "%" },
  { key: "metabolicAge", label: "體內年齡", unit: "歲" },
];
