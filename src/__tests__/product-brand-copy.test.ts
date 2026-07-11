import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function readSource(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("蒸管家 product brand copy", () => {
  it("uses 蒸管家 on the admin login page", () => {
    const source = readSource("src/app/(auth)/login/page.tsx");

    expect(source).toContain(">蒸管家</h1>");
    expect(source).not.toContain("蒸足管理系統");
  });

  it("keeps the store brand and adds 蒸管家 to the member login page", () => {
    const source = readSource("src/app/page.tsx");

    expect(source).toContain("{storeName}");
    expect(source).toContain("蒸管家｜會員預約系統");
    expect(source).not.toContain(">會員預約系統</p>");
  });
});
