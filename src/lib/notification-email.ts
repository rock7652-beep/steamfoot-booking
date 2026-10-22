import { Resend } from "resend";
import { isPreviewExternalIntegrationBlocked } from "./runtime-env";

export function notificationEmailReadiness() {
  return {
    configured: Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM?.trim()),
    blocked: isPreviewExternalIntegrationBlocked(),
  };
}

/** Strict delivery: missing credentials and preview suppression can never count as sent. */
export async function sendNotificationEmail(input: { to: string; subject: string; text: string; key: string }) {
  const readiness = notificationEmailReadiness();
  if (readiness.blocked) throw new Error("預覽環境不會實際寄信");
  if (!readiness.configured) throw new Error("寄信服務尚未設定完成");
  const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.RESEND_FROM!, to: input.to, subject: input.subject, text: input.text,
    replyTo: process.env.RESEND_REPLY_TO ?? "steambutler500@gmail.com",
  }, { idempotencyKey: input.key });
  if (result.error || !result.data?.id) throw new Error("寄信服務未接受信件，請檢查寄件設定與服務紀錄");
  return result.data.id;
}
