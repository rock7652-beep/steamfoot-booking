import "server-only";
import { PrismaClient } from "../../generated/course-client";

const globalForCourse = globalThis as unknown as {
  coursePrisma?: PrismaClient;
};
function databaseUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) return "";
  const url = new URL(base);
  if (!url.searchParams.has("connection_limit"))
    url.searchParams.set("connection_limit", process.env.VERCEL ? "1" : "5");
  if (!url.searchParams.has("pool_timeout"))
    url.searchParams.set("pool_timeout", "10");
  return url.toString();
}
export const coursePrisma =
  globalForCourse.coursePrisma ??
  new PrismaClient({
    datasources: { db: { url: databaseUrl() } },
    log: ["error"],
  });
if (process.env.NODE_ENV !== "production")
  globalForCourse.coursePrisma = coursePrisma;
