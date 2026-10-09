import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { courseCardPublicMembers } from "@/lib/course-card-public-members";

describe("public shared-card member privacy", () => {
  it("only returns identities, never contacts, health or private notes", () => {
    const members = [{ id: "member-a", name: "長姓名甲", phone: "0912345678", email: "a@example.test", notes: "private", serviceNote: "private", emergencyContactPhone: "0900000000", address: "private", health: { condition: "private" } }];
    expect(courseCardPublicMembers(members)).toEqual([{ id: "member-a", name: "長姓名甲" }]);
    expect(members[0].phone).toBe("0912345678");
  });
  it("applies the allowlist at the server-to-client portal boundary", () => {
    const source = readFileSync("src/app/(customer)/book/course-portal.tsx", "utf8");
    expect(source).toMatch(/cards: cards\.map\(card => \(\{[\s\S]*?members: courseCardPublicMembers\(card\.members\)/);
  });
});
