import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  assertCustomerInOperationStore,
  assertSameStore,
  assertStaffInCustomerStore,
  STORE_CONSISTENCY_ERROR_CODE,
} from "@/lib/store-consistency";

describe("store consistency guards", () => {
  it("passes when records belong to the expected store", () => {
    expect(() => assertSameStore("Customer", "store-taichung", "store-taichung")).not.toThrow();
    expect(() =>
      assertCustomerInOperationStore({ storeId: "store-taichung" }, "store-taichung"),
    ).not.toThrow();
    expect(() =>
      assertStaffInCustomerStore({ storeId: "store-taichung" }, "store-taichung"),
    ).not.toThrow();
  });

  it("rejects cross-store records without considering role or permission", () => {
    expect(() => assertSameStore("Customer", "store-zhubei", "store-taichung")).toThrow(
      AppError,
    );
    try {
      assertSameStore("Customer", "store-zhubei", "store-taichung");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("VALIDATION");
      expect((err as Error).message).toContain(STORE_CONSISTENCY_ERROR_CODE);
    }
  });

  it("rejects missing store ids as unsafe for writes", () => {
    expect(() => assertSameStore("Transaction", null, "store-taichung")).toThrow(
      STORE_CONSISTENCY_ERROR_CODE,
    );
    expect(() => assertSameStore("Transaction", "store-taichung", null)).toThrow(
      STORE_CONSISTENCY_ERROR_CODE,
    );
  });
});
