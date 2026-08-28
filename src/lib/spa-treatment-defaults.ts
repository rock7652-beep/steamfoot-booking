export type SpaTreatmentId =
  | "spa-demo-treatment-body-60"
  | "spa-demo-treatment-body-90"
  | "spa-demo-treatment-head-30"
  | "spa-demo-treatment-foot-30"
  | "spa-demo-treatment-face-60";

export type SpaSkillKey = "body" | "head" | "foot" | "face";

export type TreatmentRow = {
  id: SpaTreatmentId;
  name: string;
  variant: string;
  price: number;
  serviceMinutes: number;
  bufferMinutes: number;
  skillKeys: SpaSkillKey[];
  publicVisible: boolean;
};

export const INITIAL_TREATMENTS: TreatmentRow[] = [
  { id: "spa-demo-treatment-body-60", name: "全身芳療", variant: "60 分鐘", price: 1800, serviceMinutes: 60, bufferMinutes: 15, skillKeys: ["body"], publicVisible: true },
  { id: "spa-demo-treatment-body-90", name: "全身芳療", variant: "90 分鐘", price: 2500, serviceMinutes: 90, bufferMinutes: 15, skillKeys: ["body"], publicVisible: true },
  { id: "spa-demo-treatment-head-30", name: "頭部舒壓", variant: "30 分鐘", price: 800, serviceMinutes: 30, bufferMinutes: 10, skillKeys: ["head"], publicVisible: true },
  { id: "spa-demo-treatment-foot-30", name: "足部放鬆", variant: "30 分鐘", price: 800, serviceMinutes: 30, bufferMinutes: 10, skillKeys: ["foot"], publicVisible: true },
  { id: "spa-demo-treatment-face-60", name: "臉部保濕護理", variant: "60 分鐘", price: 2000, serviceMinutes: 60, bufferMinutes: 15, skillKeys: ["face"], publicVisible: false },
];
