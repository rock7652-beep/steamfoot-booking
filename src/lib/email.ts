import { Resend } from "resend";
import { deriveBaseUrl } from "@/lib/base-url";

// ============================================================
// Email utility — Resend API
//
// 環境變數：
//   RESEND_API_KEY — Resend API Key（必要）
//   RESEND_FROM    — 寄件人（預設 noreply@steamfoot.tw）
//   NEXTAUTH_URL   — 用於信件連結的 base URL（見 deriveBaseUrl()）
//
// 如果未設定 RESEND_API_KEY，會 fallback 到 console.log
// ============================================================

/** 每次呼叫時即時取 base URL — 避免 build-time 快取造成 preview 指回 prod */
function getBaseUrl(): string {
  return deriveBaseUrl();
}

function getResendApiKey(): string | undefined {
  return process.env.RESEND_API_KEY;
}

function getResendFrom(): string {
  return process.env.RESEND_FROM ?? "蒸足健康站 <noreply@steamfoot.tw>";
}

function getResend() {
  const apiKey = getResendApiKey();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

async function sendMail(to: string, subject: string, html: string) {
  const resend = getResend();

  if (!resend) {
    console.log("──────────────────────────────────────");
    console.log("[Email] RESEND_API_KEY not configured — logging to console");
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(html);
    console.log("──────────────────────────────────────");
    return;
  }

  const { data, error } = await resend.emails.send({
    from: getResendFrom(),
    to,
    subject,
    html,
  });

  if (error) {
    console.error("[Email] Resend error:", error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  console.log(`[Email] Sent successfully: ${data?.id} → ${to}`);
}

// ============================================================
// 帳號開通 Email
// ============================================================

export async function sendActivationEmail(
  email: string,
  token: string,
  customerName: string,
  /** B7-4.5: store slug for store-scoped link */
  storeSlug?: string
) {
  const baseUrl = getBaseUrl();
  const storePath = storeSlug ? `/s/${storeSlug}` : "";
  const link = `${baseUrl}${storePath}/activate/verify?token=${token}`;
  const subject = "蒸足健康站 — 帳號開通";
  const html = `
    <div style="max-width:480px;margin:0 auto;font-family:sans-serif;color:#333">
      <h2 style="color:#6366f1">蒸足健康站</h2>
      <p>${customerName} 您好，</p>
      <p>請點擊下方連結完成帳號開通，設定您的登入密碼：</p>
      <p style="margin:24px 0">
        <a href="${link}"
           style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          開通帳號
        </a>
      </p>
      <p style="font-size:13px;color:#888">此連結 24 小時內有效。若您未申請帳號開通，請忽略此信件。</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
      <p style="font-size:12px;color:#aaa">蒸足健康站會員預約系統</p>
    </div>
  `;
  await sendMail(email, subject, html);
}

// ============================================================
// 密碼重設 Email
// ============================================================

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  customerName: string,
  /** B7-4.5: store slug for store-scoped link */
  storeSlug?: string
) {
  const baseUrl = getBaseUrl();
  const storePath = storeSlug ? `/s/${storeSlug}` : "";
  const link = `${baseUrl}${storePath}/reset-password?token=${token}`;
  const subject = "蒸足健康站 — 密碼重設";
  const html = `
    <div style="max-width:480px;margin:0 auto;font-family:sans-serif;color:#333">
      <h2 style="color:#6366f1">蒸足健康站</h2>
      <p>${customerName} 您好，</p>
      <p>您已申請密碼重設，請點擊下方連結設定新密碼：</p>
      <p style="margin:24px 0">
        <a href="${link}"
           style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          重設密碼
        </a>
      </p>
      <p style="font-size:13px;color:#888">此連結 1 小時內有效。若您未申請密碼重設，請忽略此信件。</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
      <p style="font-size:12px;color:#aaa">蒸足健康站會員預約系統</p>
    </div>
  `;
  await sendMail(email, subject, html);
}

// ============================================================
// 顧客自助購買 — 通知店長 Email
// ============================================================

export interface PurchaseRequestEmailData {
  /** 收件人 — store owners + admins，去重後傳入 */
  recipients: string[];
  /** 店名（顯示在主旨/內文） */
  storeName: string;
  storeSlug: string;
  customerName: string;
  customerPhone: string | null;
  planName: string;
  amount: number;
  transferLastFour: string;
  customerNote: string | null;
  transactionId: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendPurchaseRequestNotification(
  data: PurchaseRequestEmailData,
): Promise<void> {
  const baseUrl = getBaseUrl();
  const paymentsUrl = `${baseUrl}/s/${data.storeSlug}/admin/dashboard/payments`;

  const subject = `[蒸足系統] 新購買申請待確認 — ${data.customerName} / ${data.planName}`;

  const noteBlock = data.customerNote
    ? `<tr><td style="padding:6px 0;color:#666;width:96px">備註</td><td style="padding:6px 0;color:#222;white-space:pre-wrap">${escapeHtml(data.customerNote)}</td></tr>`
    : `<tr><td style="padding:6px 0;color:#666">備註</td><td style="padding:6px 0;color:#999">無</td></tr>`;

  const phoneBlock = data.customerPhone
    ? `<tr><td style="padding:6px 0;color:#666">電話</td><td style="padding:6px 0;color:#222">${escapeHtml(data.customerPhone)}</td></tr>`
    : "";

  const html = `
    <div style="max-width:520px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#333">
      <h2 style="color:#6366f1;margin:0 0 4px">📥 新購買申請</h2>
      <p style="margin:0 0 20px;color:#666;font-size:14px">${escapeHtml(data.storeName)} — 顧客剛送出購買申請，等待您確認入帳。</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden">
        <tr style="background:#fafafa">
          <td colspan="2" style="padding:10px 14px;font-weight:600;color:#333;border-bottom:1px solid #eee">訂單摘要</td>
        </tr>
        <tr><td style="padding:8px 14px;color:#666;width:96px">顧客</td><td style="padding:8px 14px;color:#222;font-weight:500">${escapeHtml(data.customerName)}</td></tr>
        ${phoneBlock ? phoneBlock.replace(/padding:6px 0/g, "padding:8px 14px") : ""}
        <tr><td style="padding:8px 14px;color:#666">方案</td><td style="padding:8px 14px;color:#222">${escapeHtml(data.planName)}</td></tr>
        <tr><td style="padding:8px 14px;color:#666">金額</td><td style="padding:8px 14px;color:#6366f1;font-weight:700">NT$ ${data.amount.toLocaleString()}</td></tr>
        <tr><td style="padding:8px 14px;color:#666">末四碼</td><td style="padding:8px 14px;color:#222;font-family:monospace;font-weight:600">${escapeHtml(data.transferLastFour)}</td></tr>
        ${noteBlock.replace(/padding:6px 0/g, "padding:8px 14px")}
      </table>

      <p style="margin:24px 0 8px">
        <a href="${paymentsUrl}"
           style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          前往後台確認入帳
        </a>
      </p>
      <p style="margin:0;font-size:12px;color:#999">${paymentsUrl}</p>

      <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
      <p style="font-size:12px;color:#aaa;margin:0">此信由系統自動發送；交易單號 <span style="font-family:monospace">${escapeHtml(data.transactionId)}</span>。</p>
    </div>
  `;

  // 收件人去重 + 過濾空值，逐筆發送（Resend 單收件人格式較穩，且失敗不互相影響）
  const seen = new Set<string>();
  const targets = data.recipients
    .map((r) => r?.trim().toLowerCase())
    .filter((r): r is string => !!r && !seen.has(r) && (seen.add(r), true));

  for (const to of targets) {
    try {
      await sendMail(to, subject, html);
    } catch (err) {
      console.error("[Email][purchase-request] send failed", { to, err });
      // 不重拋 — 單一收件人失敗不應影響其他人或業務流程
    }
  }
}

/** 檢查 email service 是否已設定 */
export const isEmailConfigured = !!getResendApiKey();
