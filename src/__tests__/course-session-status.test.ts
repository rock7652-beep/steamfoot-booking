import { describe, expect, it } from "vitest";
import { courseSessionStatus } from "@/lib/course-session-status";

const session = (bookings: Array<{ status: "RESERVED" | "ATTENDED" | "NO_SHOW" }> = []) => ({
  startsAt: "2026-09-22T02:00:00.000Z",
  endsAt: "2026-09-22T03:00:00.000Z",
  bookings,
});

describe("courseSessionStatus", () => {
  it("distinguishes upcoming and ongoing sessions", () => {
    expect(courseSessionStatus(session(), "2026-09-22T01:59:59.000Z").label).toBe("未開始");
    expect(courseSessionStatus(session(), "2026-09-22T02:30:00.000Z").label).toBe("進行中");
  });

  it("prioritizes unfinished attendance after a session ends", () => {
    expect(courseSessionStatus(session([{ status: "RESERVED" }]), "2026-09-22T03:00:00.000Z").label).toBe("待點名 1");
  });

  it("shows no-show, completed, and empty ended sessions explicitly", () => {
    expect(courseSessionStatus(session([{ status: "NO_SHOW" }]), "2026-09-22T04:00:00.000Z").label).toBe("未到 1");
    expect(courseSessionStatus(session([{ status: "ATTENDED" }]), "2026-09-22T04:00:00.000Z").label).toBe("已完成");
    expect(courseSessionStatus(session(), "2026-09-22T04:00:00.000Z").label).toBe("已結束");
  });
});
