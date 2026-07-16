import { describe, expect, it } from "vitest";
import { resolveBookingIntegrationTestDatabaseUrl } from "@/__tests__/helpers/booking-integration-test-db";

describe("booking integration test database guard", () => {
  it.each([
    "postgresql://tester:secret@localhost:5432/booking_integration_test",
    "postgresql://tester:secret@127.0.0.1:5432/booking_integration_test",
    "postgresql://tester:secret@[::1]:5432/booking_integration_test",
  ])("allows a loopback PostgreSQL _test database", (url) => {
    expect(resolveBookingIntegrationTestDatabaseUrl({
      BOOKING_INTEGRATION_TEST_DATABASE_URL: url,
    })).toBe(url);
  });

  it.each([
    "postgresql://tester:secret@db.example.com:5432/booking_integration_test",
    "postgresql://tester:secret@db.project.supabase.co:5432/booking_integration_test",
  ])("rejects external and Supabase hosts", (url) => {
    expect(() => resolveBookingIntegrationTestDatabaseUrl({
      BOOKING_INTEGRATION_TEST_DATABASE_URL: url,
    })).toThrow(/loopback host/);
  });

  it.each([
    "not a URL",
    "mysql://tester:secret@localhost:3306/booking_integration_test",
    "postgresql://tester:secret@localhost:5432",
    "postgresql://tester:secret@localhost:5432/booking",
  ])("rejects malformed, non-PostgreSQL, database-less, or non-test URLs", (url) => {
    expect(() => resolveBookingIntegrationTestDatabaseUrl({
      BOOKING_INTEGRATION_TEST_DATABASE_URL: url,
    })).toThrow(/Unsafe booking integration test database URL/);
  });

  it("skips only when the explicit env is absent or empty", () => {
    expect(resolveBookingIntegrationTestDatabaseUrl({})).toBeUndefined();
    expect(resolveBookingIntegrationTestDatabaseUrl({
      BOOKING_INTEGRATION_TEST_DATABASE_URL: "",
    })).toBeUndefined();
  });

  it("never falls back to DATABASE_URL or DIRECT_URL", () => {
    expect(resolveBookingIntegrationTestDatabaseUrl({
      DATABASE_URL: "postgresql://tester:secret@localhost:5432/unsafe_test",
      DIRECT_URL: "postgresql://tester:secret@localhost:5432/unsafe_test",
    })).toBeUndefined();
  });
});
