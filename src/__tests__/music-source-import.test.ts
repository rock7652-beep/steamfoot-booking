import { describe, expect, it } from "vitest";
import { parseMusicSourceImport, planMusicSourceImport, sourceCustomerId, sourceImportHash, sourceStudentMarker } from "@/lib/music-source-import";
import { sourceFixture } from "./fixtures/music-source-import";

describe("source migration", () => {
  it("retains leading zeros, raw LINE status and dates without creating rights", () => {
    const data = parseMusicSourceImport(sourceFixture());
    expect(data.students[0].phone).toBe("0912345678");
    expect(data.students[0].legacyLineStatus).toBe("已綁定");
    expect(planMusicSourceImport(data, []).create).toBe(1);
  });
  it("rejects duplicate source identities and unpaired historical rows", () => {
    const input = sourceFixture(); input.students.push(input.students[0]);
    expect(() => parseMusicSourceImport(input)).toThrow("重複");
    expect(() => parseMusicSourceImport({ ...sourceFixture(), schedule: [{ sourceStudentId: "missing", dateRaw: "", timeRaw: "", teacherName: "", sourceCategory: "" }] })).toThrow("來源學生");
  });
  it("requires each original snapshot and equal historical counts", () => {
    expect(() => parseMusicSourceImport({ ...sourceFixture(), sourceRecords: [] })).toThrow("不一致");
    const x = sourceFixture(); x.sourceRecords[0].schedule.tables = [{ headers: ["類型"], rows: [["一筆"]] }] as never;
    expect(() => parseMusicSourceImport(x)).toThrow("筆數");
  });
  it("does not merge shared family phones or invent blank phones", () => {
    const input = sourceFixture(); input.students.push({ ...input.students[0], sourceStudentId: "sibling" });
    input.sourceRecords.push({ ...input.sourceRecords[0], id: "sibling" });
    expect(planMusicSourceImport(parseMusicSourceImport(input), []).review).toBe(2);
    input.students.pop(); input.sourceRecords.pop(); input.students[0].phone = "";
    expect(planMusicSourceImport(parseMusicSourceImport(input), []).review).toBe(1);
  });
  it("requires source lineage as well as name and phone to reuse a profile", () => {
    const data = parseMusicSourceImport(sourceFixture()), s = data.students[0];
    const existing = { id: sourceCustomerId(s.sourceStudentId), name: s.name, phone: s.phone, serviceNote: sourceStudentMarker(s.sourceStudentId), mergedIntoCustomerId: null };
    expect(planMusicSourceImport(data, [existing]).existing).toBe(1);
    expect(planMusicSourceImport(data, [{ ...existing, serviceNote: null }]).review).toBe(1);
    expect(planMusicSourceImport(data, [{ ...existing, name: "已修改" }]).review).toBe(1);
  });
  it("hash ignores JSON property order and detects changed content", () => {
    expect(sourceImportHash({ a: 1, b: 2 })).toBe(sourceImportHash({ b: 2, a: 1 }));
    expect(sourceImportHash({ a: 1 })).not.toBe(sourceImportHash({ a: 2 }));
  });
});
