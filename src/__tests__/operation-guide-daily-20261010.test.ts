import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableGuides, operationGuides, retiredFrontendOperationGuides } from "../lib/operation-guide";
import { dailyOperationGuides20261010 } from "../lib/operation-guide-daily-20261010";

describe("backend-only guide scope and current source boundaries", () => {
  it("keeps historical frontend articles out of current search for every module", () => {
    const permissions = [...new Set(operationGuides.map(g => g.permission).filter(Boolean))];
    const features = Object.fromEntries(operationGuides.filter(g => g.feature).map(g => [g.feature, true]));
    expect(retiredFrontendOperationGuides).toHaveLength(8);
    for (const moduleId of ["steamfoot", "spa", "course"] as const) {
      const current = availableGuides({ module: moduleId, permissions, features });
      expect(current.some(g => retiredFrontendOperationGuides.some(old => old.id === g.id))).toBe(false);
    }
  });

  it("requires both the dedicated permission and feature for owner audit guidance", () => {
    const owner = { module: "steamfoot" as const, permissions: ["store.audit.read"], features: { store_operation_audit: true } };
    expect(availableGuides(owner).some(g => g.id === "I20")).toBe(true);
    expect(availableGuides({ ...owner, permissions: ["audit.read"] }).some(g => g.id === "I20")).toBe(false);
    expect(availableGuides({ ...owner, features: {} }).some(g => g.id === "I20")).toBe(false);
  });

  it("keeps SPA notes and steam group pricing distinct and traceable", () => {
    expect(dailyOperationGuides20261010.map(g => g.id)).toEqual(["A14", "I20", "J24"]);
    expect(dailyOperationGuides20261010.find(g => g.id === "A14")?.modules).toEqual(["steamfoot"]);
    expect(dailyOperationGuides20261010.find(g => g.id === "J24")?.modules).toEqual(["spa"]);
    for (const g of dailyOperationGuides20261010) {
      for (const source of g.sources) expect(existsSync(source), source).toBe(true);
    }
  });
});
