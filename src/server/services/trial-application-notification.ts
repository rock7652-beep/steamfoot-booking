import { Resend } from "resend";
import { deriveBaseUrl } from "@/lib/base-url";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { prisma } from "@/lib/db";
import {
  applicationStatuses,
  trialApplicationSchema,
  trialNotificationSummary,
  TRIAL_NOTIFICATION_EMAIL,
} from "@/lib/trial-application";
export async function notifyTrialApplication(
  id: string,
): Promise<"SENT" | "FAILED" | "DISABLED"> {
  if (isPreviewExternalIntegrationBlocked()) return "DISABLED";
  const hook = process.env.TRIAL_INTAKE_WEBHOOK_URL;
  if (!hook && !process.env.RESEND_API_KEY) return "DISABLED";
  try {
    const record = await prisma.trialApplication.findUniqueOrThrow({
      where: { id },
    });
    const data = trialApplicationSchema.parse(record.payload);
    const intakeSummary = trialNotificationSummary(data);
    const subject = `蒸管家｜${record.revision > 1 ? "補件通知" : "新的體驗版申請"}｜${data.storeName}`;
    const hqUrl = `${deriveBaseUrl()}/hq/dashboard/trial-applications?application=${id}`;
    // Invitation credentials and resume tokens stay in the protected HQ record.
    const summary = {
      id,
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      storeName: data.storeName,
      industry: data.industry,
      contactName: data.contactName,
      phone: data.phone,
      email: data.email,
      mapsUrl: data.mapsUrl,
      lineId: data.lineId,
      friendUrl: data.friendUrl,
      missing: intakeSummary,
      status:
        applicationStatuses[
          record.status as keyof typeof applicationStatuses
        ] ?? "已收件",
    };
    if (hook) {
      const url = new URL(hook);
      if (
        url.origin !== "https://script.google.com" ||
        !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname) ||
        url.search ||
        url.hash ||
        !process.env.TRIAL_INTAKE_WEBHOOK_SECRET ||
        process.env.TRIAL_INTAKE_WEBHOOK_SECRET.length < 32
      )
        return "FAILED";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.TRIAL_INTAKE_WEBHOOK_SECRET,
          application: summary,
          subject,
          hqUrl,
        }),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      const result = await response.json();
      return response.ok &&
        result.ok === true &&
        result.id === id &&
        result.revision === record.revision &&
        result.sheet === "SAVED" &&
        result.mail === "SENT"
        ? "SENT"
        : "FAILED";
    }
    const sheetId = process.env.TRIAL_INTAKE_SHEET_ID;
    const sheetUrl =
      sheetId && /^[\w-]+$/.test(sheetId)
        ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
        : "";
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
      {
        from: process.env.RESEND_FROM ?? "蒸管家 <noreply@steamfoot.tw>",
        to: TRIAL_NOTIFICATION_EMAIL,
        subject,
        text: `店家：${data.storeName}\n類型：${data.industry}\n聯絡人：${data.contactName}\n電話：${data.phone}\nEmail：${data.email}\n\n待補資料：\n${intakeSummary}\n\n${sheetUrl ? `申請總表：${sheetUrl}\n` : ""}總部資料：${hqUrl}`,
      },
      { idempotencyKey: `trial-${id}-revision-${record.revision}` },
    );
    return result.error ? "FAILED" : "SENT";
  } catch {
    return "FAILED";
  }
}
