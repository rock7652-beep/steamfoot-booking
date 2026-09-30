import type { personalIncomeView } from "./course-personal-income";

export type PersonalIncomeLine = ReturnType<typeof personalIncomeView>["lines"][number];

export const INCOME_PAGE_SIZE = 50;

/** Apply after filtering; monthly totals must always use the unpaged rows. */
export function pageIncomeLines(lines: PersonalIncomeLine[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(lines.length / INCOME_PAGE_SIZE));
  const page = Math.max(1, Math.min(pageCount, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * INCOME_PAGE_SIZE;
  return { page, pageCount, start: lines.length ? offset + 1 : 0, end: Math.min(offset + INCOME_PAGE_SIZE, lines.length), lines: lines.slice(offset, offset + INCOME_PAGE_SIZE) };
}

/** Search the whole month independently of payment registration. */
export function filterIncomeLines(lines: PersonalIncomeLine[], query: string) {
  const text = query.trim().toLocaleLowerCase("zh-TW");
  return lines.filter(line => !text || line.label.toLocaleLowerCase("zh-TW").includes(text));
}
