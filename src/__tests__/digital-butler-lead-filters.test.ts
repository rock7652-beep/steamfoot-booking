import { describe, expect, it } from "vitest";
import { digitalButlerLeadFilterHref } from "@/lib/digital-butler-lead-filters";

const STORE_SCOPED_PATH = "/s/zhubei/admin/dashboard/digital-butler/leads";

describe("Digital Butler lead filter navigation", () => {
  it("sets the LINE provider while preserving the store route and existing filters", () => {
    expect(digitalButlerLeadFilterHref(
      STORE_SCOPED_PATH,
      "status=NEW&staff=staff_1&leadId=lead_1",
      "provider",
      "LINE",
    )).toBe(`${STORE_SCOPED_PATH}?status=NEW&staff=staff_1&leadId=lead_1&provider=LINE`);
  });

  it("replaces a source filter with Messenger and keeps the status and assignee", () => {
    expect(digitalButlerLeadFilterHref(
      STORE_SCOPED_PATH,
      "status=CONTACTING&staff=staff_1&provider=LINE",
      "provider",
      "MESSENGER",
    )).toBe(`${STORE_SCOPED_PATH}?status=CONTACTING&staff=staff_1&provider=MESSENGER`);
  });

  it("removes the provider condition for all sources without losing other filters", () => {
    expect(digitalButlerLeadFilterHref(
      STORE_SCOPED_PATH,
      "status=NEW&staff=staff_1&provider=INSTAGRAM",
      "provider",
      "",
    )).toBe(`${STORE_SCOPED_PATH}?status=NEW&staff=staff_1`);
  });
});
