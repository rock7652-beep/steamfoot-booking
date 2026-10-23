import { expect, it } from "vitest";
import { encodeReminderPanel, decodeReminderPanel } from "@/lib/reminder-panel-wire";
it("restores only server-declared dates, preserving notification text and nullable timestamps", () => {
  const at = new Date("2026-10-22T10:00:00Z");
  const data = { logs: [{ at, body: at.toISOString(), error: null }], cron: { startedAt: at, finishedAt: null }, preferences: { $date: at.toISOString() } };
  const result = decodeReminderPanel<typeof data>(JSON.parse(JSON.stringify(encodeReminderPanel(data))));
  expect(result).toEqual(data);
  expect(result.logs[0].at).toBeInstanceOf(Date);
  expect(result.logs[0].body).toBeTypeOf("string");
});
it("rejects prototype paths", () => {
  expect(() => decodeReminderPanel({ value: {}, dates: [["__proto__", "createdAt"]] })).toThrow();
  expect({}).not.toHaveProperty("createdAt");
});
