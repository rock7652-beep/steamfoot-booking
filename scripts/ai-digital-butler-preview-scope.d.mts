export const AI_PREVIEW_BRANCH: string;
export function claimsAiPreview(env?: Readonly<Record<string, string | undefined>>): boolean;
export function assertAiPreview(env?: Readonly<Record<string, string | undefined>>): void;
export function assertAiDatabaseConnection(base: string | undefined, env?: Readonly<Record<string, string | undefined>>): void;
export const AI_PREVIEW_DATABASE_ROLE: string;
export function isAiPreviewDatabaseUrl(value: string | undefined): boolean;
