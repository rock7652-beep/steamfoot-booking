import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wrapperSource = readFileSync(
  "src/server/actions/wallet-with-notifications.ts",
  "utf8",
);
const notificationSource = readFileSync(
  "src/server/services/store-manager-line-notifications.ts",
  "utf8",
);
const tsconfigSource = readFileSync("tsconfig.json", "utf8");

describe("pending payment LINE notification wiring", () => {
  it("routes existing wallet action imports through the notification wrapper", () => {
    expect(tsconfigSource).toContain(
      '"@/server/actions/wallet": ["./src/server/actions/wallet-with-notifications.ts"]',
    );
  });

  it("notifies only after the staff-side core action succeeds with PENDING", () => {
    const coreCall = wrapperSource.indexOf("await assignPlanToCustomerCore(input)");
    const successGuard = wrapperSource.indexOf(
      'result.success && input.paymentStatus === "PENDING"',
    );
    const notifyCall = wrapperSource.indexOf(
      "await notifyPendingPaymentBestEffort(result.data.transactionId)",
      successGuard,
    );

    expect(coreCall).toBeGreaterThan(-1);
    expect(successGuard).toBeGreaterThan(coreCall);
    expect(notifyCall).toBeGreaterThan(successGuard);
  });

  it("notifies after a successful customer self-purchase", () => {
    const coreCall = wrapperSource.indexOf(
      "await initiateCustomerPlanPurchaseCore(input)",
    );
    const successGuard = wrapperSource.indexOf("if (result.success)", coreCall);
    const notifyCall = wrapperSource.indexOf(
      "await notifyPendingPaymentBestEffort(result.data.transactionId)",
      successGuard,
    );

    expect(coreCall).toBeGreaterThan(-1);
    expect(successGuard).toBeGreaterThan(coreCall);
    expect(notifyCall).toBeGreaterThan(successGuard);
  });

  it("keeps notification failure outside the business result", () => {
    expect(wrapperSource).toContain(
      "[PendingPaymentLineNotification] notification failed",
    );
    expect(wrapperSource).toContain("return result;");
  });

  it("links the LINE message to the existing payment workbench transaction", () => {
    expect(notificationSource).toContain(
      "/dashboard/payments?transactionId=${encodeURIComponent(event.paymentId)}",
    );
    expect(notificationSource).toContain("前往後台確認");
  });
});
