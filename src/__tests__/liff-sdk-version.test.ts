import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import liff, { liff as namedLiff } from "@line/liff";

const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
const installedVersion = liff.getVersion();

function isPatchedVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major > 2 || (major === 2 && (minor > 31 || (minor === 31 && patch >= 1)));
}

describe("LIFF SDK security baseline", () => {
  it("pins a patched SDK and installs the exact reviewed version", () => {
    expect(isPatchedVersion(manifest.dependencies["@line/liff"])).toBe(true);
    expect(installedVersion).toBe(manifest.dependencies["@line/liff"]);
    expect(lock.packages[""].dependencies["@line/liff"]).toBe(installedVersion);
    expect(lock.packages["node_modules/@line/liff"].version).toBe(installedVersion);
  });

  it("does not retain vulnerable or mixed internal LIFF packages", () => {
    const packages = Object.entries(lock.packages).filter(([path]) => /(?:^|\/)node_modules\/@liff\//.test(path));
    expect(packages.length).toBeGreaterThan(0);
    for (const [path, entry] of packages) {
      const version = (entry as { version: string }).version;
      expect(isPatchedVersion(version), path).toBe(true);
      expect(version, path).toBe(installedVersion);
    }
  });

  it("preserves the real SDK export and APIs used by the login wrapper", () => {
    expect(namedLiff).toBe(liff);
    for (const method of ["init", "login", "logout", "isLoggedIn", "isInClient", "getIDToken", "getProfile", "getFriendship", "shareTargetPicker", "openWindow", "closeWindow"] as const) {
      expect(typeof namedLiff[method], method).toBe("function");
    }
  });
});
