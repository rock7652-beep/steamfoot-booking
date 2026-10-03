import { describe, expect, it } from "vitest";
import { matchCustomerSearch } from "@/lib/customer-search-index";

const rows = [
  { id: "1", name: "黃彥陸", phone: "0912-345-678", lineName: "Yen Lu" },
  { id: "2", name: "QA396", phone: "0987654321", lineName: null },
];
describe("instant customer matching", () => {
  it("matches a single Chinese character and partial name", () => {
    expect(matchCustomerSearch(rows, "黃")[0].id).toBe("1");
    expect(matchCustomerSearch(rows, "彥陸")[0].id).toBe("1");
  });
  it("matches normalized phone and full-width input", () => {
    expect(matchCustomerSearch(rows, "０９１２３")[0].id).toBe("1");
  });
  it("matches LINE names without case sensitivity", () => {
    expect(matchCustomerSearch(rows, "YEN")[0].id).toBe("1");
  });
  it("does not misinterpret alphanumeric names as phones", () => {
    expect(matchCustomerSearch(rows, "qa396")[0].id).toBe("2");
  });
  it("handles empty input, missing names and limits", () => {
    expect(matchCustomerSearch(rows, " ")).toEqual([]);
    expect(matchCustomerSearch(rows, "missing")).toEqual([]);
    expect(matchCustomerSearch(rows, "09", 1)).toHaveLength(1);
  });
});
