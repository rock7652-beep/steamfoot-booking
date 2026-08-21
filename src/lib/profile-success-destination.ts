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
  if (nextPath) return nextPath;
  return onboardingMode ? `${prefix}/my-plans` : null;
}
