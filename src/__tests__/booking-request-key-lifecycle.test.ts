import { describe, expect, it, vi } from "vitest";
import {
  BookingRequestKeyLifecycle,
  createBookingRequestKey,
  isBookingRequestKeyMismatch,
} from "@/lib/booking-request-key";

function sequenceFactory() {
  let next = 0;
  return vi.fn(() => `request-key-${++next}-0123456789`);
}

describe("BookingRequestKeyLifecycle", () => {
  it("creates browser-safe UUID request keys", () => {
    expect(createBookingRequestKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("keeps one key across double-clicks, lost responses, and retryable failures", () => {
    const createKey = sequenceFactory();
    const lifecycle = new BookingRequestKeyLifecycle(createKey);

    const firstClick = lifecycle.current();
    const doubleClick = lifecycle.current();
    lifecycle.handleError("SUBMISSION_IN_PROGRESS：請稍後以相同請求重試");
    const retry = lifecycle.current();

    expect(doubleClick).toBe(firstClick);
    expect(retry).toBe(firstClick);
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it("uses a new key after success starts a new booking intent", () => {
    const lifecycle = new BookingRequestKeyLifecycle(sequenceFactory());
    const firstBooking = lifecycle.current();
    lifecycle.complete();
    const secondBooking = lifecycle.current();

    expect(secondBooking).not.toBe(firstBooking);
  });

  it("replaces a reused key only after an explicit payload mismatch", () => {
    const lifecycle = new BookingRequestKeyLifecycle(sequenceFactory());
    const original = lifecycle.current();

    lifecycle.handleError("容量不足");
    expect(lifecycle.current()).toBe(original);

    lifecycle.handleError(
      "IDEMPOTENCY_KEY_REUSED：同一請求識別不可用於不同預約內容",
    );
    expect(lifecycle.current()).not.toBe(original);
  });

  it("recognizes only the server payload-mismatch contract", () => {
    expect(isBookingRequestKeyMismatch("IDEMPOTENCY_KEY_REUSED：payload mismatch")).toBe(true);
    expect(isBookingRequestKeyMismatch("SUBMISSION_IN_PROGRESS")).toBe(false);
    expect(isBookingRequestKeyMismatch(null)).toBe(false);
  });

  it("gives legal 4+1 split bookings different keys", () => {
    const lifecycle = new BookingRequestKeyLifecycle(sequenceFactory());
    const fourPeopleRequest = lifecycle.current();
    lifecycle.complete();
    const onePersonRequest = lifecycle.current();

    expect(onePersonRequest).not.toBe(fourPeopleRequest);
  });
});
