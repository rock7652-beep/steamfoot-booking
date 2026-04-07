import { Resend } from "resend";

// ============================================================
// Email utility — Resend API
//
// 環境變數：
//   RESEND_API_KEY — Resend API Key（必要）
//   RESEND_FROM    — 寄件人（預設 noreply@steamfoot.tw）
//   NEXTAUTH_URL   — 用於信件連結的 base URL
//
// 如果未設定 RESEND_API_KEY，會 fallback 到 console.log
// ============================================================

/** 每次呼叫時即時讀取環境變數，避免 build-time 快取 */
function getBaseUrl(): string {
  const url =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "https://steamfoot.com";
  // 移除尾端斜線
  return url.replace(/\/+$/, "");
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
  customerName: string
) {
  const baseUrl = getBaseUrl();
  const link = `${baseUrl}/activate/verify?token=${token}`;
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
  customerName: string
) {
  const baseUrl = getBaseUrl();
  const link = `${baseUrl}/reset-password?token=${token}`;
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

/** 檢查 email service 是否已設定 */
export const isEmailConfigured = !!getResendApiKey();
