export type TeacherFeeSeat = {
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

