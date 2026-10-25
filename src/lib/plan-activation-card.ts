import type { LineFlexMessage } from "@/lib/line";
import { LINE_CARD_COLORS as colors, LINE_CARD_STYLES } from "@/lib/line-card-theme";
import { planActivationMessage, type PlanActivationSnapshot } from "@/lib/plan-activation-notification";

/** Shared display data for the real LINE message and the settings preview. */
export function planActivationCardPresentation(value: PlanActivationSnapshot) {
  return {
    title: "方案已開通",
    storeName: value.storeName,
    greeting: `${value.customerName} 您好，您的方案已開通！`,
    rows: [
      { label: "方案", value: value.planName },
      { label: "本次開通", value: `${value.quantity} ${value.unit}` },
      { label: "使用期限", value: value.expiresDate ?? "無固定到期日，依方案使用規則" },
    ],
    footer: "可至本店會員專區查看方案及預約。",
  };
}

/** v1 stays stable for retries whose route already records flex-v1. */
export function buildPlanActivationCard(value: PlanActivationSnapshot): LineFlexMessage {
  const card = planActivationCardPresentation(value);
  return {
    type: "flex",
    altText: Array.from(planActivationMessage(value)).slice(0, 400).join(""),
    contents: {
      type: "bubble", styles: LINE_CARD_STYLES,
      header: {
        type: "box", layout: "vertical", paddingAll: "16px", spacing: "sm",
        backgroundColor: colors.headerBackground,
        contents: [
          { type: "text", text: card.title, color: colors.headerText, weight: "bold", size: "lg", wrap: true },
          { type: "text", text: card.storeName, color: colors.headerSubtext, size: "sm", wrap: true },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "md", paddingAll: "16px",
        contents: [
          { type: "text", text: card.greeting, color: colors.text, size: "sm", wrap: true },
          ...card.rows.map(row => ({
            type: "box", layout: "horizontal", spacing: "md",
            contents: [
              { type: "text", text: row.label, color: colors.label, size: "sm", flex: 3, wrap: true },
              { type: "text", text: row.value, color: colors.text, size: "sm", flex: 7, align: "end", wrap: true },
            ],
          })),
        ],
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "16px",
        contents: [{ type: "text", text: card.footer, color: colors.label, size: "sm", wrap: true }],
      },
    },
  };
}
