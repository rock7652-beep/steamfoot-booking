import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpaBookingSummary } from "@/app/(dashboard)/dashboard/spa-schedule/booking-summary";
import { spaPartyLabel, spaReceiptStatus } from "@/lib/spa-booking-display";
import type { SpaScheduleBooking } from "@/server/queries/spa-schedule";

const receipt = {
  id: "receipt-1",
  amount: 1800,
  paymentMethod: "CASH",
  paidAt: "2026-09-11T02:00:00Z",
  refunded: true,
};
const booking: SpaScheduleBooking = {
  id: "booking-1",
  customerId: "c",
  serviceStaffId: "s",
  startTime: "10:00",
  endTime: "11:00",
  status: "COMPLETED",
  serviceName: "預約當時服務",
  totalPrice: 1800,
  serviceLocationId: "l",
  notes: "保留備註",
  treatmentIds: [],
  updatedAt: receipt.paidAt,
  receipt,
};
describe("SPA historical booking summary", () => {
  it("distinguishes refunds, returned credit, returned sessions and voids", () => {
    expect(spaReceiptStatus(receipt)).toBe("已退款 NT$1,800");
    expect(
      spaReceiptStatus({ ...receipt, paymentMethod: "STORED_VALUE" }),
    ).toBe("已退回儲值 NT$1,800");
    expect(
      spaReceiptStatus({ ...receipt, paymentMethod: "ENTITLEMENT", uses: 1 }),
    ).toBe("已退回 1 次");
    expect(
      spaReceiptStatus({ ...receipt, voided: true, refundAmount: 1000 }),
    ).toBe("已作廢 · 已退款 NT$1,000");
    expect(spaReceiptStatus({ ...receipt, refunded: false })).toBe("已結帳");
  });
  it("labels the first party member as contact and numbers companions from one", () => {
    expect(spaPartyLabel({ partyGroupId: "g", guestIndex: 1 })).toBe(
      "主要聯絡人",
    );
    expect(spaPartyLabel({ partyGroupId: "g", guestIndex: 2 })).toBe("同行 1");
    expect(spaPartyLabel({ partyGroupId: "g", guestIndex: 3 })).toBe("同行 2");
    expect(spaPartyLabel({})).toBe("");
  });
  it("renders history without a wizard and explicitly identifies historical balance", () => {
    const html = renderToStaticMarkup(
      createElement(SpaBookingSummary, {
        booking: {
          ...booking,
          receipt: {
            ...receipt,
            paymentMethod: "STORED_VALUE",
            balanceAfter: 3200,
          },
        },
        date: "2026-09-11",
        customer: "測試顧客",
        staff: "測試人員",
        location: "位置 A",
      }),
    );
    expect(html).toContain("預約當時服務");
    expect(html).toContain("已退回儲值 NT$1,800");
    expect(html).toContain("結帳當時");
    expect(html).toContain("3,200");
    expect(html).toContain("帳務明細");
    expect(html).toContain("保留備註");
    expect(html).not.toContain("下一步");
    expect(html).not.toContain("checkbox");
  });
});
