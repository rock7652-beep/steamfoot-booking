import "server-only";
import { createRequire } from "node:module";
import { join } from "node:path";

// Keep Prisma native loaders out of Turbopack's unbounded cwd expansion.
// Each exact generated directory is explicitly included in next.config.ts.
const nativeRequire = createRequire(join(process.cwd(), "package.json"));
export function loadCoursePrismaRuntime() {
  return nativeRequire(/* turbopackIgnore: true */ "./generated/course-client") as typeof import("../../generated/course-client");
}
export function loadBeautyPrismaRuntime() {
  return nativeRequire(/* turbopackIgnore: true */ "./generated/beauty-client") as typeof import("../../generated/beauty-client");
}
