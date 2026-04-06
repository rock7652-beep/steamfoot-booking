import nodemailer from "nodemailer";

// ============================================================
// Email utility — graceful fallback to console when SMTP unconfigured
// ============================================================

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM ?? "noreply@steamfoot.tw";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://steamfoot.tw";

const isConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

function getTransporter() {
  if (!isConfigured) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendMail(to: string, subject: string, html: string) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log("──────────────────────────────────────");
    console.log("[Email] SMTP not configured — logging to console");
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(html);
    console.log("──────────────────────────────────────");
    return;
  }

  await transporter.sendMail({
    from: `蒸足健康站 <${SMTP_FROM}>`,
    to,
    subject,
    html,
  });
}

// ============================================================
// 帳號開通 Email
// ============================================================

export async function sendActivationEmail(
  email: string,
  token: string,
  customerName: string
) {
  const link = `${BASE_URL}/activate/verify?token=${token}`;
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
  const link = `${BASE_URL}/reset-password?token=${token}`;
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
