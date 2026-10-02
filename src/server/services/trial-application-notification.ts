import { Resend } from "resend";
import { deriveBaseUrl } from "@/lib/base-url";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { TRIAL_CONTACT_EMAIL } from "@/lib/trial-application";
export async function notifyTrialApplication(
  id: string,
): Promise<"SENT" | "FAILED" | "DISABLED"> {
  if (isPreviewExternalIntegrationBlocked() || !process.env.RESEND_API_KEY)
    return "DISABLED";
  try {
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.RESEND_FROM ?? "蒸管家 <noreply@steamfoot.tw>",
      to: TRIAL_CONTACT_EMAIL,
      subject: "蒸管家｜新的體驗版申請",
      text: `收到新的體驗版申請。請登入總部查看：${deriveBaseUrl()}/hq/dashboard/trial-applications?application=${id}`,
    });
    return result.error ? "FAILED" : "SENT";
  } catch {
    return "FAILED";
  }
}
