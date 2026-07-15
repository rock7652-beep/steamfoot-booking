import { describe, expect, it } from "vitest";
import {
  resolveBookingConcurrencyTestDatabaseUrl,
} from "@/__tests__/helpers/booking-concurrency-test-db";

describe("booking concurrency test database guard", () => {
  it.each([
    "postgresql://tester:secret@localhost:5432/booking_concurrency_test",
    "postgresql://tester:secret@127.0.0.1:5432/booking_concurrency_test",
    "postgresql://tester:secret@[::1]:5432/booking_concurrency_test",
  ])("allows a loopback PostgreSQL _test database", (url) => {
    expect(resolveBookingConcurrencyTestDatabaseUrl({
      BOOKING_CONCURRENCY_TEST_DATABASE_URL: url,
    })).toBe(url);
  });

  it.each([
    "postgresql://tester:secret@db.example.com:5432/booking_concurrency_test",
    "postgresql://tester:secret@db.project.supabase.co:5432/booking_concurrency_test",
  ])("rejects external and Supabase hosts", (url) => {
    expect(() => resolveBookingConcurrencyTestDatabaseUrl({
      BOOKING_CONCURRENCY_TEST_DATABASE_URL: url,
    })).toThrow(/loopback host/);
  });

  it("rejects a database name without the _test suffix", () => {
    expect(() => resolveBookingConcurrencyTestDatabaseUrl({
      BOOKING_CONCURRENCY_TEST_DATABASE_URL: "postgresql://tester:secret@localhost:5432/booking",
    })).toThrow(/must end with _test/);
  });

  it.each([
    "not a URL",
    "mysql://tester:secret@localhost:3306/booking_concurrency_test",
    "postgresql://tester:secret@localhost:5432",
  ])("rejects malformed, non-PostgreSQL, or database-less URLs", (url) => {
    expect(() => resolveBookingConcurrencyTestDatabaseUrl({
      BOOKING_CONCURRENCY_TEST_DATABASE_URL: url,
    })).toThrow(/Unsafe booking concurrency test database URL/);
  });

  it("returns undefined only when the explicit integration-test env is absent", () => {
    expect(resolveBookingConcurrencyTestDatabaseUrl({})).toBeUndefined();
    expect(resolveBookingConcurrencyTestDatabaseUrl({
      BOOKING_CONCURRENCY_TEST_DATABASE_URL: "",
    })).toBeUndefined();
  });

  it("does not inspect DATABASE_URL or DIRECT_URL fallbacks", () => {
    expect(resolveBookingConcurrencyTestDatabaseUrl({
      DATABASE_URL: "postgresql://tester:secret@localhost:5432/unsafe_test",
      DIRECT_URL: "postgresql://tester:secret@localhost:5432/unsafe_test",
    })).toBeUndefined();
  });
});
