/** Presentation only: never controls routing, recipients or notification rules. */
export const LINE_CARD_COLORS = {
  headerBackground: "#153F33",
  headerText: "#FFFFFF",
  headerSubtext: "#E7EDE8",
  primary: "#153F33",
  secondary: "#153F33",
  reschedule: "#153F33",
  cancel: "#666666",
  label: "#666666",
  text: "#203C33",
  background: "#FFFFFF",
  ivory: "#FAF8F2",
  gold: "#C4A45C",
  testBadgeBackground: "#E9D9B9",
  testBadgeText: "#5A421F",
} as const;

export const LINE_CARD_STYLES = {
  body: { backgroundColor: LINE_CARD_COLORS.background, separator: true, separatorColor: LINE_CARD_COLORS.gold },
  footer: { backgroundColor: LINE_CARD_COLORS.ivory },
} as const;

export function outlinedLineAction(action: { type: "uri"; label: string; uri: string }) {
  return {
    type: "box" as const,
    layout: "vertical" as const,
    borderColor: LINE_CARD_COLORS.primary,
    borderWidth: "1px",
    cornerRadius: "8px",
    backgroundColor: LINE_CARD_COLORS.background,
    contents: [{ type: "button" as const, style: "link" as const, color: LINE_CARD_COLORS.primary, action }],
  };
}
