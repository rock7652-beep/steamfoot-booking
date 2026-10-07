export const GUIDE_UI_PREVIEW_BRANCH: string;
export const GUIDE_UI_PREVIEW_DATABASE_URL: string;
export function isGuideUiPreview(env?: Record<string, string | undefined>): boolean;
export function createGuideUiDisabledClient(): unknown;
