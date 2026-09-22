export type CourseConsumptionType =
  | "PAYMENT"
  | "HOLD"
  | "USAGE"
  | "RETURN"
  | "REFUND";

export type CourseConsumptionRow = {
  id: string;
  date: string;
  type: CourseConsumptionType;
  title: string;
  detail: string;
  status: string;
  planName: string | null;
  amount: number | null;
  quantity: number | null;
  unit: string | null;
};

export type CoursePointEffect = Pick<
  CourseConsumptionRow,
  "type" | "status" | "quantity"
>;

const debitsQuota = (status: string, termCourse: boolean) =>
  status === "ATTENDED" || (status === "NO_SHOW" && termCourse);

/**
 * Convert the append-only point ledger into customer-facing effects.
 * Reservation holds are deliberately separate from actual usage so they never
 * inflate the consumed quota shown to the member.
 */
export function coursePointEffect(
  kind: string,
  points: number,
  termCourse: boolean,
): CoursePointEffect | null {
  const safePoints = Math.abs(points);
  const base = kind.split(":")[0];
  if (base === "RESERVE") {
    return { type: "HOLD", status: "保留中（尚未扣抵）", quantity: -safePoints };
  }
  if (base === "DEBIT") {
    return { type: "USAGE", status: "已扣抵", quantity: -safePoints };
  }
  if (base === "RELEASE") {
    return { type: "RETURN", status: "已釋放保留", quantity: safePoints };
  }
  if (base !== "CORRECT") return null;

  const [, before = "", after = ""] = kind.split(":");
  const wasDebited = debitsQuota(before, termCourse);
  const isDebited = debitsQuota(after, termCourse);
  if (!wasDebited && isDebited) {
    return { type: "USAGE", status: "點名更正後扣抵", quantity: -safePoints };
  }
  if (wasDebited && !isDebited) {
    return {
      type: "RETURN",
      status: after === "RESERVED" ? "扣抵退回並改為保留" : "點名更正後退回",
      quantity: safePoints,
    };
  }
  if (after === "RESERVED") {
    return { type: "HOLD", status: "更正為保留中", quantity: -safePoints };
  }
  if (before === "RESERVED") {
    return { type: "RETURN", status: "更正後釋放保留", quantity: safePoints };
  }
  return null;
}

export function courseConsumptionTypeLabel(type: CourseConsumptionType) {
  return {
    PAYMENT: "購買／付款",
    HOLD: "預約保留",
    USAGE: "上課扣抵",
    RETURN: "額度退回",
    REFUND: "退款",
  }[type];
}
