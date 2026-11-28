import "server-only";
import { createHash } from "node:crypto";
import { PUBLIC_MARKETING_FAQ } from "@/lib/public-marketing-faq";
import { BOOKING_TYPES } from "@/lib/public-booking-types";
import { trialGuides } from "@/lib/trial-guides";
import { PUBLIC_GUIDES, guidePath } from "@/lib/public-guides";
import {
  PUBLIC_PRICING_PLANS,
  PUBLIC_MONTHLY_SUBSCRIPTION_COPY,
  getPublicPricingOffer,
  getPublicAddonOffer,
} from "@/lib/public-pricing-offer";
import {
  PUBLIC_TRIAL_COPY,
  PUBLIC_ADDON_GROUPS,
  PUBLIC_LINE_DEPENDENCY,
  PUBLIC_SUBSCRIPTION_RETENTION,
} from "@/lib/public-marketing-copy";
import { ALLIANCE_BRANCH_PRICING_COPY } from "@/lib/alliance-subscription";
import { PUBLIC_STORE_CASES } from "@/lib/public-store-cases";
import { BRAND_AI_FAQ } from "@/lib/brand-ai-faq";

export type BrandKnowledge = {
  id: string;
  title: string;
  url: string;
  text: string;
  kind?: "customer-case" | "demonstration" | "guide";
};
const origin = "https://www.steamfoot.com";
const source = (
  id: string,
  title: string,
  path: string,
  text: string,
): BrandKnowledge => ({ id, title, url: origin + path, text });

/** Explicit public allowlist, never a filesystem/doc crawler or tenant query. */
export function brandKnowledge(query: string, now = Date.now()) {
  const offer = getPublicPricingOffer(now),
    addons = getPublicAddonOffer(now);
  const core: BrandKnowledge[] = [
    {
      ...source(
        "public-cases",
        "公開蒸足真實案例（非美業案例）",
        "/cases",
        PUBLIC_STORE_CASES.map((item) => `${item.name}：${item.intro}`).join(
          "\n",
        ) +
          "\n目前核准的實際店家案例只有上述蒸足門市，沒有美業、運動或音樂店家的公開案例。不得推測名稱、成效、聯絡或參訪安排。",
      ),
      kind: "customer-case",
    },
    source("brand", "蒸管家", "/pricing", BRAND_AI_FAQ[0].answer),
    source(
      "trial",
      "免費體驗及到期規則",
      "/apply",
      Object.values(PUBLIC_TRIAL_COPY).join("\n"),
    ),
    source(
      "subscription",
      "月繳條件及資料政策",
      "/pricing",
      PUBLIC_MONTHLY_SUBSCRIPTION_COPY + "\n" + PUBLIC_SUBSCRIPTION_RETENTION,
    ),
    source(
      "branches",
      "分店計費規則",
      "/pricing",
      ALLIANCE_BRANCH_PRICING_COPY,
    ),
    source(
      "line",
      "LINE串接及外部費用",
      "/pricing/features#reminders",
      PUBLIC_LINE_DEPENDENCY,
    ),
    ...PUBLIC_PRICING_PLANS.map((plan) =>
      source(
        `plan-${plan.id}`,
        plan.name,
        "/pricing",
        `${plan.audience}；${plan.purpose}。月繳每期 NT$${plan.monthly}，12期合計 NT$${plan.annual}；最低承諾12個月，不含年繳贈送。年繳 NT$${plan.annual} 一次繳清，使用${offer.months}個月。${offer.active ? "年繳贈送優惠至2026/12/31（台灣時間），自正式啟用起算。" : "目前沒有核准的年繳贈送優惠。"}\n${plan.benefits.join("；")}`,
      ),
    ),
    ...BOOKING_TYPES.map((module) => ({
      ...source(
        `module-${module.id}`,
        module.name,
        `/pricing/features/${module.id}`,
        `${module.who}。${module.question} ${module.detail}。本頁介面為功能示意、範例資料，非實際店家或可操作測試帳號。`,
      ),
      kind: "demonstration" as const,
    })),
  ];
  const optional = [
    source(
      "privacy",
      "隱私權與資料政策",
      "/privacy",
      PUBLIC_SUBSCRIPTION_RETENTION,
    ),
    source(
      "terms",
      "公開服務條款",
      "/terms",
      "服務條款請查看官網；沒有核准的個案資訊時須請專人核對，不自行承諾或操作。",
    ),
    source(
      "refunds",
      "退款政策",
      "/refunds",
      "退款條件請查看官網並請專人確認個案，AI不能執行退款或推測可退金額。",
    ),
    ...Object.entries(trialGuides).map(([id, guide]) => ({
      ...source(
        `setup-${id}`,
        guide.title,
        `/pricing/trial/guide/${id}`,
        "公開申請設定指南入口。請依指南在官方管理介面操作；不要在聊天貼上密碼、Key或邀請連結。",
      ),
      kind: "guide" as const,
    })),
    ...PUBLIC_MARKETING_FAQ.flatMap((group, g) =>
      group.questions.map((faq, i) =>
        source(`faq-${g}-${i}`, faq.question, "/#faq", faq.answers.join("\n")),
      ),
    ),
    ...PUBLIC_ADDON_GROUPS.flatMap((group, i) =>
      group.features.map((feature) =>
        source(
          `addon-${feature.id}`,
          feature.name,
          `/pricing/features#${feature.id}`,
          `${feature.description}；${group.purpose}。每項年繳 NT$${(i === 0 ? addons.toolMonthly : addons.businessMonthly) * 12}，一次繳清，使用${offer.months}個月。是否內含／免費任選依方案與官網說明，不自行承諾免費。`,
        ),
      ),
    ),
    // Index published guides only. Fictional case examples are not product facts.
    ...PUBLIC_GUIDES.filter((g) => g.status === "published").map((g) => ({
      ...source(
        `guide-${g.id}`,
        g.title,
        guidePath(g),
        `公開經營指南：${g.featureName}。文章情境為示意，不是操作帳號、真實顧客案例或成效保證。`,
      ),
      kind: "guide" as const,
    })),
  ];
  const tokens = query.match(/[a-z][\w-]+|[\p{Script=Han}]{2}/giu) ?? [];
  const score = (s: BrandKnowledge) =>
    tokens.filter((t) =>
      `${s.id} ${s.title} ${s.text}`.toLowerCase().includes(t.toLowerCase()),
    ).length;
  const selected = optional
    .map((s) => ({ s, score: score(s) }))
    .filter((x) => x.score > 0 && x.s.id.length <= 100)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.s);
  const sources = [...core];
  for (const item of selected)
    if (Buffer.byteLength(JSON.stringify([...sources, item]), "utf8") <= 10_000)
      sources.push(item);
  const version = createHash("sha256")
    .update(JSON.stringify(sources))
    .digest("hex");
  return { version, sources };
}
