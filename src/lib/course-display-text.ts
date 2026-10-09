/** Presentation text only. Never apply to customer data, identifiers or saved snapshots. */
export function courseDisplayText(text: string, music: boolean | "FITNESS" | "MUSIC"): string {
  if (music !== true && music !== "MUSIC") return text;
  return text.replaceAll("運動教練", "運動授課人員").replaceAll("教練／教師", "教師").replaceAll("教師／教練", "教師")
    .replaceAll("教練／老師", "教師").replaceAll("老師／教練", "教師")
    .replaceAll("教練", "教師");
}
