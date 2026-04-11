import type { DutyRole, ParticipationType, UserRole } from "@prisma/client";

// ============================================================
// DutyRole 中文標籤
// ============================================================

export const DUTY_ROLE_LABELS: Record<DutyRole, string> = {
  STORE_MANAGER: "店長",
  BRANCH_MANAGER: "分店長",
  INTERN_COACH: "實習教練",
  HOURLY_STAFF: "計時人員",
};

export const DUTY_ROLE_SHORT: Record<DutyRole, string> = {
  STORE_MANAGER: "店長",
  BRANCH_MANAGER: "分店長",
  INTERN_COACH: "實習",
  HOURLY_STAFF: "計時",
};

// ============================================================
// ParticipationType 中文標籤
// ============================================================

export const PARTICIPATION_TYPE_LABELS: Record<ParticipationType, string> = {
  PRIMARY: "主服務",
  ASSIST: "協助服務",
  SHADOW: "學習跟班",
  SUPPORT: "現場支援",
};

export const PARTICIPATION_TYPE_SHORT: Record<ParticipationType, string> = {
  PRIMARY: "主",
  ASSIST: "協助",
  SHADOW: "跟班",
  SUPPORT: "支援",
};

// ============================================================
// DutyRole 自動帶入映射（根據 Staff 的 UserRole 預設）
// ============================================================

export const DEFAULT_DUTY_ROLE_MAP: Partial<Record<UserRole, DutyRole>> = {
  ADMIN: "STORE_MANAGER",
  STORE_MANAGER: "STORE_MANAGER",
  COACH: "BRANCH_MANAGER",
};

// ============================================================
// Enum 值列表（供下拉選單用）
// ============================================================

export const DUTY_ROLES: DutyRole[] = [
  "STORE_MANAGER",
  "BRANCH_MANAGER",
  "INTERN_COACH",
  "HOURLY_STAFF",
];

export const PARTICIPATION_TYPES: ParticipationType[] = [
  "PRIMARY",
  "ASSIST",
  "SHADOW",
  "SUPPORT",
];
