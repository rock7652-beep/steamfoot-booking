import "server-only";
import { PUBLIC_STORE_CASES } from "@/lib/public-store-cases";
import { BRAND_AI_FAQ } from "@/lib/brand-ai-faq";
import type { BrandKnowledge } from "./brand-ai-knowledge";
import type { BrandProfile } from "./brand-ai-dialogue";

/** Only server-approved source text, not an unchecked model draft. No extra call. */
export function brandAiSafeFallback(
  question: string,
  sources: BrandKnowledge[],
  profile: BrandProfile,
) {
  if (
    /退款|退費|取消預約|改期|幫我預約|客戶資料|會員資料|密碼|刪除|轉帳|其他店|天氣/u.test(
      question,
    )
  )
    return null;
  if (
    /範例|示意|展示/u.test(question) &&
    !/實際|實體|真實|店家/u.test(question)
  ) {
    const ids = sources
      .filter(
        (s) => s.id === "public-cases" || s.id === `module-${profile.industry}`,
      )
      .map((s) => s.id);
    return ids.length
      ? {
          text: "你想看實際店家案例，還是功能示意？目前公開的實店案例是蒸足門市；其他模組的示意不能當作真實客戶。",
          sourceIds: ids,
        }
      : null;
  }
  const id = /案例|實體店|實際店|實店/u.test(question)
    ? "public-cases"
    : /試用|體驗|申請|申辦/u.test(question)
      ? "trial-application"
      : /價格|多少錢|月費|費用|方案/u.test(question) && profile.plan
        ? `plan-${profile.plan}`
        : null;
  const source = sources.find((item) => item.id === id);
  if (!source) return null;
  const text =
    id === "public-cases"
      ? "以下是公開蒸足案例，不能當作美業、運動或音樂店家的實例。\n\n" +
        PUBLIC_STORE_CASES.map((item) => `${item.name}：${item.intro}`).join(
          "\n\n",
        )
      : id === "trial-application"
        ? BRAND_AI_FAQ[2].answer
        : source.text;
  return {
    text: text.includes(source.url) ? text : `${text}\n\n${source.url}`,
    sourceIds: [source.id],
  };
}
