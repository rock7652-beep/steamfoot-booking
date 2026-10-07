import type { LineFlexMessage } from "@/lib/line";
import { LINE_CARD_COLORS as colors, LINE_CARD_STYLES } from "@/lib/line-card-theme";

/** Adapt all manager event bodies at the shared delivery boundary; never change event rules. */
export function managerNotificationPresentation(body: string, storeSlug?: string) {
  const lines = body.split("\n").map(line => line.trim()).filter(Boolean);
  const title = lines.shift() || "店務通知";
  const actions: Array<{ type: "button"; style: "primary"; color: string; action: { type: "uri"; label: string; uri: string } }> = [];
  const details: string[] = [];
  for (const line of lines) {
    const match = line.match(/^(.*?)(https:\/\/\S+)$/);
    if (!match) { details.push(line); continue; }
    const url = new URL(match[2]);
    // Legacy VIP links used a global dashboard route. Keep the intended store explicit.
    if (storeSlug && url.pathname.startsWith("/dashboard")) {
      url.pathname = `/s/${encodeURIComponent(storeSlug)}/admin${url.pathname}`;
    }
    const label = match[1].replace(/[：:\s]+$/, "") || "查看顧客";
    actions.push({ type: "button", style: "primary", color: colors.primary,
      action: { type: "uri", label: Array.from(label).slice(0, 20).join(""), uri: url.toString() } });
  }
  return { title, details, actions };
}

export function buildManagerNotificationCard(body: string, storeName: string, storeSlug?: string): LineFlexMessage {
  const { title, details, actions } = managerNotificationPresentation(body, storeSlug);
  return {
    type: "flex",
    altText: Array.from(`${storeName}｜${title}｜${details.join("・")}`).slice(0, 400).join(""),
    contents: {
      type: "bubble", styles: LINE_CARD_STYLES,
      header: { type: "box", layout: "vertical", paddingAll: "16px", spacing: "sm",
        backgroundColor: colors.headerBackground, contents: [
          { type: "text", text: title, color: colors.headerText, weight: "bold", size: "lg", wrap: true },
          { type: "text", text: storeName, color: colors.headerSubtext, size: "sm", wrap: true },
        ] },
      body: { type: "box", layout: "vertical", spacing: "md", contents:
        (details.length ? details : ["請查看後台通知內容"]).map(text => ({
          type: "text", text, color: colors.text, size: "sm", wrap: true,
        })) },
      ...(actions.length ? { footer: { type: "box", layout: "vertical", spacing: "sm", contents: actions } } : {}),
    },
  };
}
