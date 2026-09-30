import type { personalIncomeView } from "./course-personal-income";

export type PersonalIncomeLine = ReturnType<typeof personalIncomeView>["lines"][number];
export type IncomeFilter = "all" | "unpaid" | "paid";

export const INCOME_PAGE_SIZE = 50;

/** Apply after filtering; monthly totals must always use the unpaged rows. */
export function pageIncomeLines(lines: PersonalIncomeLine[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(lines.length / INCOME_PAGE_SIZE));
  const page = Math.max(1, Math.min(pageCount, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * INCOME_PAGE_SIZE;
  return { page, pageCount, start: lines.length ? offset + 1 : 0, end: Math.min(offset + INCOME_PAGE_SIZE, lines.length), lines: lines.slice(offset, offset + INCOME_PAGE_SIZE) };
}

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
