import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("SPA schedule isolation", () => {
  it("reads SpaBooking through the dedicated client and never imports the legacy booking query", () => {
    const query = readFileSync("src/server/queries/spa-schedule.ts", "utf8");
    const page = readFileSync("src/app/(dashboard)/dashboard/spa-schedule/page.tsx", "utf8");
    expect(query).toContain("spaPrisma.spaBooking.findMany");
    expect(query).not.toContain("@/server/queries/booking");
    expect(page).toContain("requireSpaStore");
    expect(page).toContain("checkPermission");
  });

  it("writes only SpaBooking through the dedicated client", () => {
    const action = readFileSync("src/server/actions/spa-booking.ts", "utf8");
    expect(action).toContain("tx.spaBooking.create");
    expect(action).toContain("requireSpaStore");
    expect(action).not.toContain("prisma.booking.create");
  });
});
