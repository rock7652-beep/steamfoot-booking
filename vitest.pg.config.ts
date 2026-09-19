import { mergeConfig, defineConfig } from "vitest/config";
import path from "node:path";
import base from "./vitest.config";

// A resolved module alias is stable under concurrent dynamic imports, unlike
// vi.mock(next/headers). Only this disposable-database test job uses it.
export default mergeConfig(base, defineConfig({
  resolve: { alias: { "next/headers": path.resolve(__dirname, "src/__tests__/helpers/pg-request-context.ts") } },
}));
