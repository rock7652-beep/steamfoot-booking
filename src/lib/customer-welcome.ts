/** Store-scoped customer onboarding title. Never infer a brand from slug. */
export function customerWelcomeTitle(store: { name?: string | null } | null | undefined): string {
  const name = store?.name?.trim();
  return name ? `歡迎使用${name}` : "歡迎使用本店服務";
}
