import { describe, expect, it } from "vitest";
import { makeupStatus, musicNoteDisplay } from "@/lib/music-display";

describe("music presentation", () => {
  it("replaces a source marker for display while preserving human notes", () => {
    const source = "SOURCE_REPLICA|YINJIAOYUN|example:store|STUDENT|abc123\n週二聯絡";
    expect(musicNoteDisplay(source)).toBe("音教雲匯入\n週二聯絡");
    expect(source).toContain("SOURCE_REPLICA");
    expect(musicNoteDisplay("一般備註")).toBe("一般備註");
    expect(musicNoteDisplay(null)).toBeNull();
  });
  it("does not present a completed or arranged makeup as expired", () => {
    expect(makeupStatus("ATTENDED", "2026-01-01", "2026-10-15").label).toBe("已完成");
    expect(makeupStatus("RESERVED", "2026-01-01", "2026-10-15").label).toBe("已安排");
    expect(makeupStatus("AVAILABLE", "2026-10-14", "2026-10-15").label).toBe("已逾期");
    expect(makeupStatus("AVAILABLE", "2026-10-15", "2026-10-15").label).toBe("待安排");
  });
});
