import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("trial reminder convergence contract", () => {
  it("offers the signed booking-link handoff after both LINE and Messenger booking flows", () => {
    const runtime = source("src/server/services/digital-butler-runtime.ts");
    const lineWebhook = source("src/app/api/line/webhook/route.ts");
    const messengerWebhook = source("src/app/api/messenger/webhook/route.ts");
    expect(runtime).toContain('conversation.provider === "LINE" || conversation.provider === "MESSENGER"');
    expect(runtime).toContain('input.provider === "LINE" || input.provider === "MESSENGER"');
    expect(runtime).toContain("chatBookingCompletionPending");
    expect(runtime).not.toContain('conversation.provider === "MESSENGER"\n          && isBookingRequest');
    expect(lineWebhook).toContain('createTrialBookingChatLink({ storeId, channel: "LINE"');
    expect(messengerWebhook).toContain('channel: "MESSENGER"');
  });

  it("claims Messenger delivery before Meta and keeps definite failures retryable", () => {
    const worker = source("src/server/services/messenger-utility-reminder.ts");
    expect(worker.indexOf("claimDelivery(input)")).toBeLessThan(worker.indexOf("sendMessengerUtilityTemplate({"));
    expect(worker).toContain('eventType: "MESSENGER_UTILITY_REMINDER"');
    expect(worker).toContain('failedClaim?.outcome !== "FAILED"');
    expect(worker).toContain("await markClaimFailed(claimId)");
    expect(worker.indexOf("await markClaimFailed(claimId)")).toBeLessThan(worker.lastIndexOf("await record(input, code)"));
    expect(worker).toContain("delivery may already have happened");
    expect(worker).toContain('quotaConsumed: false');
    expect(worker).toContain('quotaConsumed: code === "SENT"');
  });

  it("clears stale reschedule slots and selection whenever the date changes", () => {
    const manager = source("src/app/trial-booking/manage/trial-booking-manager.tsx");
    const changeHandler = manager.slice(manager.indexOf('onChange={e => {'), manager.indexOf('onChange={e => {') + 180);
    expect(changeHandler).toContain("setDate(e.target.value)");
    expect(changeHandler).toContain("setSlots([])");
    expect(changeHandler).toContain('setSelected("")');
  });

  it("only lets the latest reschedule-slot request update the page", () => {
    const manager = source("src/app/trial-booking/manage/trial-booking-manager.tsx");
    expect(manager).toContain("slotRequestGate.invalidate()");
    expect(manager).toContain("const requestId = slotRequestGate.issue()");
    expect(manager).toContain("slotRequestGate.isCurrent(requestId)");
  });

  it("opens each LINE reminder action in its dedicated self-service mode", () => {
    const message = source("src/server/services/trial-booking-reminder-line-message.ts");
    const manager = source("src/app/trial-booking/manage/trial-booking-manager.tsx");
    expect(message).toContain('url.searchParams.set("action", action)');
    expect(message).toContain('actionUrl("confirm")');
    expect(message).toContain('actionUrl("cancel")');
    expect(message).toContain('actionUrl("reschedule")');
    expect(manager).toContain('action === "confirm"');
    expect(manager).toContain('action === "cancel"');
    expect(manager).toContain('action === "reschedule"');
    expect(manager).toContain("void loadRescheduleSlots(booking.bookingDate)");
  });

  it("shows signed booking status and does not offer blank reschedule controls after one change", () => {
    const actions = source("src/server/actions/trial-booking-self-service.ts");
    const service = source("src/server/services/trial-booking-self-service.ts");
    const manager = source("src/app/trial-booking/manage/trial-booking-manager.tsx");
    expect(actions).toContain("getTrialBookingManagementStatusFromChat");
    expect(service).toContain("getTrialBookingManagementStatus");
    expect(service).toContain("bookingDate: booking.bookingDate.toISOString().slice(0, 10)");
    expect(manager).toContain("目前預約：{booking.bookingDate} {booking.slotTime}");
    expect(manager).toContain("本預約已改期一次，如需調整請聯絡店家");
    expect(manager).toContain("booking?.customerRescheduleCount && booking.customerRescheduleCount >= 1");
  });

  it("uses the signed booking date as the initial reschedule date before loading slots", () => {
    const manager = source("src/app/trial-booking/manage/trial-booking-manager.tsx");
    expect(manager).toContain("setDate(status.bookingDate)");
    expect(manager).toContain("void loadRescheduleSlots(booking.bookingDate)");
    expect(manager).toContain('if (!requestedDate) return');
  });

  it("removes every cancellation action after a successful cancellation", () => {
    const manager = source("src/app/trial-booking/manage/trial-booking-manager.tsx");
    expect(manager).toContain('bookingStatus: "CANCELLED"');
    expect(manager).toContain("setCancellationComplete(true)");
    expect(manager).toContain("if (cancelled) return <main");
    expect(manager).toContain('>{message || "這筆預約已取消。"}</p>');
  });

  it("only lets the latest public booking date request update slots or loading state", () => {
    const form = source("src/app/pricing/experience/zhubei/book/zhubei-trial-booking-form.tsx");
    expect(form).toContain("const requestId = slotRequestGate.issue()");
    expect(form).toContain("if (!slotRequestGate.isCurrent(requestId)) return");
    expect(form).toContain("if (slotRequestGate.isCurrent(requestId)) setLoadingSlots(false)");
    expect(form).toContain("slotRequestGate.invalidate()");
  });

  it("keeps Messenger scheduled reminders isolated from the LINE delivery engine", () => {
    const engine = source("src/server/reminder-engine.ts");
    expect(engine).toContain('booking.trialBookingChannel === "MESSENGER"');
    expect(engine).toContain("MESSENGER_SCHEDULED_REMINDER_ISOLATED");
    expect(engine).not.toContain("sendMessengerUtilityReminder({");
  });

  it("keeps individual delivery failures separate from cron failure", () => {
    const route = source("src/app/api/cron/reminders/route.ts");
    const retry = source("src/server/reminder-cron-retry.ts");
    expect(route).toContain("if (reminderFailed)");
    expect(route).toContain("(reminderResult?.failed ?? 0) > 0 || otherFailed");
    expect(retry).toContain("if (result.failed > 0) return \"PARTIAL\"");
  });

  it("persists a consumed chat link and channel in the booking transaction", () => {
    const booking = source("src/server/actions/public-trial-booking.ts");
    expect(booking).toContain("resolveTrialBookingChatLink(data.entry)");
    expect(booking).toContain("trialBookingChannel: chatLink.channel");
    expect(booking).toContain("tx.trialBookingLink.updateMany");
    expect(booking).toContain("bookingId: created.id");
  });

  it("opens the public trial form from one LIFF rich-menu tap with a verified entry", () => {
    const bridge = source("src/app/(liff)/liff/public-trial/public-trial-liff-bridge.tsx");
    const route = source("src/app/api/liff/public-trial-entry/route.ts");
    const page = source("src/app/(liff)/liff/public-trial/page.tsx");
    const config = source("src/lib/liff/public-trial-config.ts");
    expect(bridge).toContain("initLiff(liffId)");
    expect(bridge).toContain("getIDToken()");
    expect(bridge).toContain('fetch("/api/liff/public-trial-entry"');
    expect(bridge).toContain("window.location.replace");
    expect(route).toContain("verifyLiffIdToken");
    expect(route).toContain("probeStoreLineRecipient");
    expect(route).toContain("createTrialBookingChatLink");
    expect(route).toContain("resolvePublicTrialLiffConfig");
    expect(page).toContain("resolvePublicTrialLiffConfig");
    expect(config).toContain('ZHUBEI_PUBLIC_TRIAL_LINE_LOGIN_CHANNEL_ID = "2011147985"');
    expect(config).toContain('ZHUBEI_PUBLIC_TRIAL_LIFF_ID = "2011147985-tQ5wrAdH"');
    expect(config).toContain('hsinchu: "2010761154-irZGuDty"');
    expect(config).toContain('taichung: "2010761154-mupiLvi6"');
  });

  it("routes a public trial through LINE when the existing customer is already verified", () => {
    const booking = source("src/server/actions/public-trial-booking.ts");
    expect(booking).toContain('customer.lineLinkStatus === "LINKED" && customer.lineUserId');
    expect(booking).toContain('{ trialBookingChannel: "LINE" as const }');
  });

  it("uses trial self-service for verified first trials even when an older booking has no channel", () => {
    const engine = source("src/server/reminder-engine.ts");
    expect(engine).toContain('const isLineTrialBooking = booking.bookingType === "FIRST_TRIAL"');
    expect(engine).toContain("createTrialBookingActionToken(booking)");
    expect(engine).toContain("isLineTrialBooking ? TRIAL_TEMPLATE : templateBody");
  });

  it("scopes calendar and slots to the same chat entry as submission", () => {
    const booking = source("src/server/actions/public-trial-booking.ts");
    const form = source("src/app/pricing/experience/zhubei/book/zhubei-trial-booking-form.tsx");
    expect(booking).toContain("resolveAvailabilityStore(storeSlug, entry)");
    expect(form).toContain("fetchPublicTrialMonth(viewYear, viewMonth, entry, storeSlug)");
    expect(form).toContain("fetchPublicTrialSlots(date, entry, storeSlug)");
  });

  it("keeps every store presentation from accepting another store's chat entry", () => {
    const booking = source("src/server/actions/public-trial-booking.ts");
    const chatLink = source("src/server/services/trial-booking-chat-link.ts");
    expect(booking).toContain("store?.slug === storeSlug ? store : null");
    expect(booking).toContain("chatLink && store?.slug !== data.storeSlug");
    expect(chatLink).toContain("SUPPORTED_PUBLIC_BOOKING_STORE_SLUGS");
    expect(chatLink).toContain('"hsinchu"');
    expect(chatLink).toContain('"taichung"');
    expect(chatLink).toContain("TRIAL_BOOKING_STORE_NOT_SUPPORTED");
  });

  it("repairs a same-phone legacy id only through the store-signed LINE entry policy", () => {
    const booking = source("src/server/actions/public-trial-booking.ts");
    const resolver = source("src/server/services/public-trial-line-customer.ts");
    expect(booking).toContain("resolvePublicTrialLineCustomer");
    expect(resolver).toContain("probeStoreLineRecipient");
    expect(resolver).toContain('probe.status === "COMPATIBLE"');
    expect(resolver).toContain('probe.status === "UNAVAILABLE"');
    expect(resolver).toContain("prisma.customer.updateMany");
    expect(resolver).toContain("lineUserId: candidate.lineUserId");
  });

  it("removes the shared booking URL on both secure-link success and failure", () => {
    for (const path of ["src/app/api/line/webhook/route.ts", "src/app/api/messenger/webhook/route.ts"]) {
      const webhook = source(path);
      expect(webhook).toContain('intent.text.replace(ZHUBEI_EXPERIENCE_BOOKING_URL');
      expect(webhook).toContain("專屬預約連結暫時無法建立");
    }
  });

  it("fails closed for anonymous chat links without a signing secret", () => {
    const engine = source("src/server/reminder-engine.ts");
    expect(engine).toContain("TRIAL_BOOKING_ACTION_SECRET_NOT_CONFIGURED");
    expect(engine).not.toContain(
      'booking.bookingType === "FIRST_TRIAL" && booking.trialBookingChannel && process.env.TRIAL_BOOKING_ACTION_SECRET',
    );
  });

  it("rejects the current slot in both listing and mutation paths", () => {
    const selfService = source("src/server/services/trial-booking-self-service.ts");
    expect(selfService).toContain(
      'date === booking.bookingDate.toISOString().slice(0, 10) && slot.startTime === booking.slotTime',
    );
    expect(selfService).toContain(
      'date === booking.bookingDate.toISOString().slice(0, 10) && slotTime === booking.slotTime',
    );
    expect(selfService).toContain(
      'date === current.bookingDate.toISOString().slice(0, 10) && slotTime === current.slotTime',
    );
  });
});
