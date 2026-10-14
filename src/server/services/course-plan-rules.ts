import "server-only";
import { musicPlanQuote } from "@/lib/music-course-products";
import { AppError } from "@/lib/errors";

type Plan = { unit: string; musicTerms: number | null; musicBonusLessons: number; musicTermSizes: number[] };

export function assertCoursePlanBusiness(music: boolean, plan: Plan, hasMusicSetup: boolean) {
  if (music && plan.unit !== "SESSION")
    throw new AppError("VALIDATION", "音樂教室方案以堂數計算；每次上課使用 1 堂");
  if (!music && (hasMusicSetup || plan.musicBonusLessons || plan.musicTermSizes.length || plan.musicTerms !== null))
    throw new AppError("VALIDATION", "運動方案不使用音樂課期數");
}

/** Both catalogue selection and inline music setup derive the same authoritative values. */
export function quoteMusicPlanSettings(
  plan: Pick<Plan, "musicTerms" | "musicBonusLessons">,
  template: Parameters<typeof musicPlanQuote>[0],
) {
  if (plan.musicTerms === null) throw new AppError("VALIDATION", "音樂方案請選擇一種課程與購買期數");
  let quote: ReturnType<typeof musicPlanQuote>;
  try { quote = musicPlanQuote(template, plan.musicTerms); }
  catch (error) { throw new AppError("VALIDATION", error instanceof Error ? error.message : "課程設定不完整"); }
  const points = quote.lessons + plan.musicBonusLessons;
  if (points > 100000) throw new AppError("VALIDATION", "總堂數超過上限");
  return {points, price:quote.price, validDays:quote.validDays, musicTermSizes:Array<number>(plan.musicTerms).fill(template.musicTermLessons!)};
}
