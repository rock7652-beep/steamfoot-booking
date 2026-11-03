export type TeacherFeeSeat = {
  tuitionTemplateId?:string|null;
  discountedBasis?: {total:number;lessons:number};
  openingPriceSource?: boolean;
  openingMakeupSource?: boolean;
  musicOpeningMakeupEntitlementId?: string | null;
  openingIssue?: string | null;
  verifiedOpeningMakeupFee?: boolean;
  verifiedTrialFeeBase?: number;
  id: string;
  customerName: string;
  status: string;
  bookingKind: string;
  absenceKind: string | null;
  originalUnitPrice: number | null;
  sportsCharge?: number | null;
};
export type TeacherFeeDetail = { id: string; name: string; base: number | null; amount: number | null; reason: string };
export type TeacherFeeResult = { amount: number | null; issue: string | null; details: TeacherFeeDetail[] };

