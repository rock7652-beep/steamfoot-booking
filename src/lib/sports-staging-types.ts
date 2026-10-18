import { z } from "zod";
export const sportsScheduleRule = z.object({
  perpetual:z.boolean().optional(),
  frequency: z.enum(["SINGLE", "WEEKLY", "BIWEEKLY"]),
  enrollment: z.enum(["ASSIGNED", "OPEN"]),
  planId: z.string().min(1).max(100).nullable(),
  students: z
    .array(
      z.object({
        customerId: z.string().min(1).max(100),
        cardId: z.string().min(1).max(100).nullable(),
      }),
    )
    .max(50),
  trialPrice: z.number().int().min(0).max(1000000).default(0),
});
export type SportsScheduleRule = z.infer<typeof sportsScheduleRule>;
export type SportsSubject = {
  id: string;
  name: string;
  category: string;
  active: boolean;
  updatedAt: string;
};
export type SportsFee = {
  id: string;
  subject: string;
  name: string;
  unit: string;
  amount: number;
  price: number;
  days: number;
  cost: number;
  shared: boolean;
  templateId: string;
  snapshot: string;
  compensation?: {mode:"SHARE"|"HOUR";value:number};
};
export type SportsLesson = {
  id: string;
  subject: string;
  fee: string;
  kind: string;
  mode: string;
  date: string;
  time: string;
  duration: number;
  coach: string;
  room: string;
  capacity: number;
  students: string[];
  price: number;
  series: string;
  bookings: Array<{
    id: string;
    name: string;
    status: string;
    trial: boolean;
    paymentId?: string;
  }>;
  originalDate?: string;
  originalTime?: string;
  revision?: number;
  customer?: string;
  phone?: string;
  paymentId?: string;
  cancelled?: boolean;
};
export type SportsSnapshot = {
  storeId: string;
  subjects: SportsSubject[];
  fees: SportsFee[];
  lessons: SportsLesson[];
  students: Array<{
    id: string;
    name: string;
    fee: string;
    cardId: string;
    available: number;
  }>;
  customers: Array<{ id: string; name: string; phone: string }>;
  coaches: Array<{ id: string; name: string; templates: string[] }>;
  rooms: Array<{
    id: string;
    name: string;
    capacity: number | null;
    rental: boolean;
  }>;
  date: string;
};

export const sportsCompensation = z.object({mode:z.enum(["SHARE","HOUR"]),value:z.number().finite().min(0).max(1000000)}).refine(r=>r.mode!=="SHARE"||r.value<=100,"拆帳比例需介於 0–100%").refine(r=>Math.abs(r.value*100-Math.round(r.value*100))<0.000001,"最多填兩位小數");
export const sportsFeeSetup = z.object({
  compensation: sportsCompensation.optional(),
  expectedCompensation: sportsCompensation.nullable().optional(),
  subject: z.string().min(1).max(100),
  cost: z.number().int().min(1).max(10000),
  coachIds: z.array(z.string().min(1).max(100)).min(1).max(100),
  requestKey: z.string().uuid(),
});

/** Compare validated intent, independent of JSONB object-key ordering.
 * A null requested card means automatic allocation; an earlier explicit
 * allocation is still a valid receipt for that same automatic request.
 */
export function sameSportsScheduleRule(stored: unknown, requested: unknown) {
  const a = sportsScheduleRule.safeParse(stored),
    b = sportsScheduleRule.safeParse(requested);
  if (!a.success || !b.success) return false;
  const normalized = {
    ...a.data,
    students: a.data.students.map((student, i) => ({
      ...student,
      cardId: b.data.students[i]?.cardId === null ? null : student.cardId,
    })),
  };
  return JSON.stringify(normalized) === JSON.stringify(b.data);
}
