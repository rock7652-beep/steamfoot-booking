// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CashbookEntryFields } from "@/app/(dashboard)/dashboard/cashbook/_components/cashbook-entry-fields";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("shared cashbook entry form", () => {
  it("uses the chosen revenue category independently of the linked customer", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(createElement(CashbookEntryFields, { storeId: "store-1", today: "2026-09-27", editableDate: true, closedDates: [], instantSearch: false })));
    const retail = host.querySelector('input[name="entryKind"][value="RETAIL"]') as HTMLInputElement;
    act(() => retail.click());
    const item = host.querySelector('input[placeholder="例如：精油"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(item, "精油");
      item.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect((host.querySelector('input[name="category"]') as HTMLInputElement).value).toBe("零售-精油");
    expect((host.querySelector('input[name="type"]') as HTMLInputElement).value).toBe("INCOME");
    expect(host.querySelector('input[name="customerId"]')).not.toBeNull();
    act(() => (host!.querySelector('input[name="entryKind"][value="OTHER"]') as HTMLInputElement).click());
    expect((host.querySelector('input[name="category"]') as HTMLInputElement).value).toBe("其他收入");
    expect(host.querySelector('input[name="customerId"]')).not.toBeNull();
    act(() => (host!.querySelector('input[name="entryKind"][value="EXPENSE"]') as HTMLInputElement).click());
    expect((host.querySelector('input[name="type"]') as HTMLInputElement).value).toBe("EXPENSE");
    expect(host.querySelector('input[name="customerId"]')).toBeNull();
  });

  it("keeps a linked customer's retail entry in retail when editing", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(createElement(CashbookEntryFields, {
      storeId: "store-1", today: "2026-09-27", editableDate: true, closedDates: [], instantSearch: false,
      defaultEntry: { type: "INCOME", amount: 500, category: "零售-精油", paymentMethod: "CASH", note: "", customer: { id: "customer-1", name: "測試顧客" } },
    })));
    expect((host.querySelector('input[name="customerId"]') as HTMLInputElement).value).toBe("customer-1");
    expect((host.querySelector('input[name="category"]') as HTMLInputElement).value).toBe("零售-精油");
    expect((host.querySelector('input[name="entryKind"][value="RETAIL"]') as HTMLInputElement).checked).toBe(true);
  });
});
