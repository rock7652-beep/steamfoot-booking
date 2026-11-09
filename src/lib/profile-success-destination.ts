interface ProfileSuccessDestinationInput {
  nextPath: string | null;
  onboardingMode: boolean;
  prefix: string;
}

/**
 * 首次註冊完成後前往「我的方案」。
 * 若顧客是從預約流程被要求補資料，則回到原流程，避免中斷操作。
 * 一般編輯個人資料不自動跳頁。
 */
export function resolveProfileSuccessDestination({
  nextPath,
  onboardingMode,
  prefix,
}: ProfileSuccessDestinationInput): string | null {
  const fallback = onboardingMode ? `${prefix}/my-plans` : null;
  if (!nextPath) return fallback;

  // A stale completion link must not send a saved profile back to itself.
  // Return destinations remain inside the currently selected store.
  try {
    const destination = new URL(nextPath, "https://profile.invalid");
    const path = decodeURIComponent(destination.pathname);
    if (destination.origin !== "https://profile.invalid" ||
        !path.startsWith(`${prefix}/`) ||
        path === `${prefix}/profile` || path.startsWith(`${prefix}/profile/`)) {
      return fallback;
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}
