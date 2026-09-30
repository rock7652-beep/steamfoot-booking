import type { personalIncomeView } from "./course-personal-income";

export type PersonalIncomeLine = ReturnType<typeof personalIncomeView>["lines"][number];
export type IncomeFilter = "all" | "unpaid" | "paid";

export function incomePaymentStatus(line: { amount: number | null; paid: number | null }) {
  if (line.amount === null || line.paid === null) return "待核對";
  if (line.paid > line.amount) return "溢付待核對";
  if (line.amount === 0) return "無應付金額";
  if (line.paid === 0) return "未付";
  return line.paid < line.amount ? "部分已付" : "已付清";
}

export function filterIncomeLines(lines: PersonalIncomeLine[], filter: IncomeFilter, query: string) {
  const text = query.trim().toLocaleLowerCase("zh-TW");
  return lines.filter(line => {
    const status = incomePaymentStatus(line);
    const matches = filter === "all" || (filter === "unpaid"
      ? status === "未付" || status === "部分已付"
      : status === "已付清");
    return matches && (!text || line.label.toLocaleLowerCase("zh-TW").includes(text));
  });
}
