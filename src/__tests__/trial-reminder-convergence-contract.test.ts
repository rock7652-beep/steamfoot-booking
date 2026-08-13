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

  it("marks a batch with individual failures as retryable", () => {
    const route = source("src/app/api/cron/reminders/route.ts");
    const retry = source("src/server/reminder-cron-retry.ts");
    expect(route).toContain("reminderFailed || (reminderResult?.failed ?? 0) > 0");
    expect(retry).toContain("if (result.failed > 0) return \"FAILED\"");
  });

  it("persists a consumed chat link and channel in the booking transaction", () => {
    const booking = source("src/server/actions/public-trial-booking.ts");
    expect(booking).toContain("resolveTrialBookingChatLink(data.entry)");
    expect(booking).toContain("trialBookingChannel: chatLink.channel");
    expect(booking).toContain("tx.trialBookingLink.updateMany");
    expect(booking).toContain("bookingId: created.id");
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
    expect(booking).toContain("resolveAvailabilityStore(entry)");
    expect(form).toContain("fetchPublicTrialMonth(viewYear, viewMonth, entry)");
    expect(form).toContain("fetchPublicTrialSlots(date, entry)");
  });

  it("keeps the Zhubei presentation from accepting another store's chat entry", () => {
    const booking = source("src/server/actions/public-trial-booking.ts");
    const chatLink = source("src/server/services/trial-booking-chat-link.ts");
    expect(booking).toContain("store?.slug === STORE_SLUG ? store : null");
    expect(booking).toContain("chatLink && store?.slug !== STORE_SLUG");
    expect(chatLink).toContain('SUPPORTED_PUBLIC_BOOKING_STORE_SLUG = "zhubei"');
    expect(chatLink).toContain("TRIAL_BOOKING_STORE_NOT_SUPPORTED");
  });

  it("never falls back from a LINE chat link to an unrelated phone owner", () => {
    const booking = source("src/server/actions/public-trial-booking.ts");
    expect(booking).toContain("A phone number typed into a public form is not proof");
    expect(booking).toContain("此手機已有顧客資料");
    expect(booking).not.toContain("customer = { id: phoneCustomer.id");
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
