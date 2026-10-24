/** Recognize current and legacy music trial teaching items consistently. */
export function isMusicTrialTemplate(template: { musicTrialMode?: string | null; category?: string | null } | null | undefined): boolean {
  const category = template?.category?.trim().replace(/\s+/g, "").toLocaleLowerCase();
  return Boolean(template?.musicTrialMode) || category === "體驗" || category === "體驗課" || category === "trial";
}
