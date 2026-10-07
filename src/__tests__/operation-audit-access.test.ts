import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/server/actions/operation-audit", () => ({ loadOperationHistory: vi.fn() }));
import { OperationAuditAccessProvider } from "@/components/operation-audit-access";
import { OperationHistoryButton } from "@/components/operation-history-button";
import { DevicePageSelect } from "@/components/device-preview/device-page-select";
const button = () => createElement(OperationHistoryButton, { targetType: "Booking", targetId: "b" });
it("fails closed without headquarters access and keeps headquarters history available", () => {
  expect(renderToStaticMarkup(button())).toBe("");
  expect(renderToStaticMarkup(createElement(OperationAuditAccessProvider, { allowed: false }, button()))).toBe("");
  expect(renderToStaticMarkup(createElement(OperationAuditAccessProvider, { allowed: true }, button()))).toContain("查看紀錄");
});
it.each(["steamfoot", "spa", "course"] as const)("restricts %s preview audit shortcut to headquarters", moduleId => {
  const props = { moduleId, value: "bookings" as const, onChange: vi.fn() };
  expect(renderToStaticMarkup(createElement(DevicePageSelect, props))).not.toContain("operation-audits");
  expect(renderToStaticMarkup(createElement(DevicePageSelect, { ...props, canViewAudit: true }))).toContain("operation-audits");
});
