import { describe, expect, it } from "vitest";
import {
  hasPasswordlessProfileProvider,
  requiresProfilePassword,
} from "@/lib/profile-password-policy";

describe("profile password policy", () => {
  it.each(["line", "google"])(
    "does not require a new password for %s login",
    (provider) => {
      expect(hasPasswordlessProfileProvider([provider])).toBe(true);
      expect(
        requiresProfilePassword({ hasPassword: false, providers: [provider] })
      ).toBe(false);
    }
  );

  it("still requires a password for a new phone-only account", () => {
    expect(
      requiresProfilePassword({ hasPassword: false, providers: [] })
    ).toBe(true);
  });

  it("does not require another password when one already exists", () => {
    expect(
      requiresProfilePassword({ hasPassword: true, providers: [] })
    ).toBe(false);
  });
});
