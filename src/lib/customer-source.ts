import type { AuthSource, LineLinkStatus } from "@prisma/client";

/**
 * 顧客「真實註冊來源」推導
 *
 * 為什麼不直接信 Customer.authSource？
 *   實務發現 authSource 與真實資料常不一致：
 *     - /register 流程硬寫 authSource="EMAIL"，但實際是「手機+密碼註冊」
 *     - 顧客合併（LINE Customer 合進 EMAIL Customer）後 authSource 未升級
 *   → 店長看「來源 Email 註冊（但 email=null）」時無法判斷真實狀況。
 *
 * 推導採「資料證據優先於欄位標籤」：
 *   1. Account[line] 存在 + Customer.lineUserId 存在 → LINE 登入
 *   2. Account[google] 存在 + Customer.googleId 存在 → GOOGLE 登入
 *   3. User.passwordHash 存在 + Account 為空 → 手機/密碼註冊
 *   4. Customer.userId 為空（後台手建未啟用） → 店長手建
 *   5. 其他 → 來源未知
 *
 * 同時偵測 authSource 與證據不一致的情況，回傳 inconsistent + 原因。
 */

export type DerivedSourceKind =
  | "LINE"
  | "GOOGLE"
  | "PHONE_PASSWORD"
  | "EMAIL"
  | "MANUAL"
  | "UNKNOWN";

export type CustomerSourceSnapshot = {
  authSource: AuthSource;
  /** Customer.email — UI 可見的 email */
  email: string | null;
  lineUserId: string | null;
  lineLinkStatus: LineLinkStatus;
  googleId: string | null;
  /** Customer.userId 是否存在（用於判斷是否後台手建未啟用） */
  hasUser: boolean;
  /** User.passwordHash 是否存在（不傳遞 hash 本身） */
  hasPassword: boolean;
  /** User 連結的 NextAuth Account provider 列表 */
  accountProviders: string[];
};

export type DerivedCustomerSource = {
  kind: DerivedSourceKind;
  /** 顯示用 label：「LINE 登入」「手機/密碼註冊」⋯⋯ */
  label: string;
  /** authSource 與真實證據不符 */
  inconsistent: boolean;
  /** 不一致原因（給 tooltip 用） */
  inconsistencyReason: string | null;
};

const KIND_LABEL: Record<DerivedSourceKind, string> = {
  LINE: "LINE 登入",
  GOOGLE: "Google 登入",
  PHONE_PASSWORD: "手機/密碼註冊",
  EMAIL: "Email 註冊",
  MANUAL: "店長手建",
  UNKNOWN: "來源未知",
};

const AUTH_SOURCE_LABEL_FRIENDLY: Record<string, string> = {
  LINE: "LINE 登入",
  GOOGLE: "Google 登入",
  EMAIL: "Email 註冊",
  MANUAL: "店長手建",
};

function friendlyAuthSource(s: string): string {
  return AUTH_SOURCE_LABEL_FRIENDLY[s] ?? s;
}

export function getDerivedSourceLabel(kind: DerivedSourceKind): string {
  return KIND_LABEL[kind];
}

export function deriveCustomerSource(
  s: CustomerSourceSnapshot,
): DerivedCustomerSource {
  const hasLineAccount = s.accountProviders.includes("line");
  const hasGoogleAccount = s.accountProviders.includes("google");

  // ── Step 1: 從證據推導真實來源 ──
  let kind: DerivedSourceKind;
  if (hasLineAccount && s.lineUserId) {
    kind = "LINE";
  } else if (hasGoogleAccount && s.googleId) {
    kind = "GOOGLE";
  } else if (s.hasPassword && s.accountProviders.length === 0) {
    // 有密碼且無 OAuth → /register 路徑（手機+密碼）
    kind = "PHONE_PASSWORD";
  } else if (!s.hasUser) {
    // 無 User 連結 → 後台手建未啟用
    kind = "MANUAL";
  } else {
    kind = "UNKNOWN";
  }

  // ── Step 2: 偵測不一致 ──
  // 訊息採「店長視角」用語：先說真實狀況、再說資料標記、最後給「不影響使用 / 建議動作」。
  // 工程師細節（Account[line] / passwordHash …）留在 IdentityDiagnosticPanel 的證據欄位。
  let inconsistencyReason: string | null = null;

  // 證據顯示 LINE，但 authSource 不是 LINE → 多半是合併殘留
  if (kind === "LINE" && s.authSource !== "LINE") {
    inconsistencyReason = `此顧客實際為「LINE 登入」，但資料標記為「${friendlyAuthSource(s.authSource)}」。\n不影響使用，可能是先前合併操作的殘留。`;
  }
  // 證據顯示 Google，但 authSource 不是 GOOGLE
  else if (kind === "GOOGLE" && s.authSource !== "GOOGLE") {
    inconsistencyReason = `此顧客實際為「Google 登入」，但資料標記為「${friendlyAuthSource(s.authSource)}」。\n不影響使用。`;
  }
  // 證據顯示手機+密碼，但 authSource=EMAIL → /register 硬寫 EMAIL 的歷史問題
  else if (kind === "PHONE_PASSWORD" && s.authSource === "EMAIL") {
    inconsistencyReason = `此顧客實際為「手機/密碼註冊」，但資料標記為「Email 註冊」。\n不影響使用，建議後續引導綁定 LINE 以避免重複帳號。`;
  }
  // 證據顯示無 User，但 authSource 不是 MANUAL
  else if (kind === "MANUAL" && s.authSource !== "MANUAL") {
    inconsistencyReason = `此顧客為後台手動建立、尚未啟用登入，但資料標記為「${friendlyAuthSource(s.authSource)}」。\n不影響使用，可能是建立過程的標記錯誤。`;
  }
  // authSource=LINE 但實際無 LINE 證據 → 資料漂移
  else if (
    s.authSource === "LINE" &&
    kind !== "LINE" &&
    !hasLineAccount &&
    !s.lineUserId
  ) {
    inconsistencyReason = `資料標記為「LINE 登入」，但找不到對應的 LINE 綁定紀錄。\n可能是合併或同步時的資料漂移，建議重新確認綁定狀態。`;
  }
  // authSource=GOOGLE 但實際無 Google 證據
  else if (
    s.authSource === "GOOGLE" &&
    kind !== "GOOGLE" &&
    !hasGoogleAccount &&
    !s.googleId
  ) {
    inconsistencyReason = `資料標記為「Google 登入」，但找不到對應的 Google 帳號綁定紀錄。\n可能是同步時的資料漂移。`;
  }
  // 證據未知（活著的 User 但沒密碼也沒 OAuth）
  else if (kind === "UNKNOWN") {
    inconsistencyReason = `無法判斷此顧客的註冊方式（既無密碼也無社群登入紀錄）。\n可能是舊資料殘留，建議聯繫技術人員確認。`;
  }

  return {
    kind,
    label: KIND_LABEL[kind],
    inconsistent: inconsistencyReason !== null,
    inconsistencyReason,
  };
}
