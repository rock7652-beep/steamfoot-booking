import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { assertAiPreview } from "../../../scripts/ai-digital-butler-preview-scope.mjs";
import { AiButlerRepository, type AiSql } from "./repository";

function sql(client: Pick<Prisma.TransactionClient, "$queryRawUnsafe">): AiSql {
  return { query: (query, values = []) => client.$queryRawUnsafe(query, ...values) };
}
/** Reuse the existing shared client, including its connection and isolation guards. */
export function aiButlerRepository() {
  assertAiPreview();
  return new AiButlerRepository({ ...sql(prisma), transaction: work =>
    prisma.$transaction(tx => work(sql(tx)), { maxWait: 5000, timeout: 10_000 }) });
}
