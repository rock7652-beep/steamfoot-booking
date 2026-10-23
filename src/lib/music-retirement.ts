import "server-only";
import { Prisma } from "@prisma/client";
import manifest from "./music-retirement-manifest.json";
import { assertMusicOpeningPreviewEnvironment } from "../../scripts/music-opening-preview-scope.mjs";

/** Owner-approved exact identities. No name/prefix matching; no source-system access. */
export { manifest as musicRetirementManifest };
export function musicRetirementEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.VERCEL !== "1") return false;
  try { assertMusicOpeningPreviewEnvironment(env); return true; } catch { return false; }
}
export type RetirementRegistry = Readonly<Record<string, readonly string[]>>;
export function musicRetirementWhere(model: string, registry: RetirementRegistry) {
  if (model === "CourseCardMember" || model === "CoursePointEntry") return { NOT: { storeId: manifest.storeId, cardId: { in: registry.CoursePointCard ?? [] } } };
  const ids = registry[model] ?? [];
  const key = model === "CourseCompensationSnapshot" ? "sessionId" : model === "CourseMusicTuition" ? "purchaseId" : "id";
  return ids.length ? { NOT: { storeId: manifest.storeId, [key]: { in: ids } } } : {};
}
/** Private identities are read only from the sealed preview DB, never shipped in source. */
export async function loadRetirementRegistry(reader: { $queryRaw<T>(sql: Prisma.Sql): Promise<T> }): Promise<RetirementRegistry> {
  const rows=await reader.$queryRaw<Array<{entityType:string;ids:string[]}>>(Prisma.sql`
    SELECT "entityType",array_agg("rowKey" ORDER BY "rowKey") ids FROM "MusicOperationalArchive"
    WHERE "storeId"=${manifest.storeId} AND "batchId"=${manifest.batchId} GROUP BY "entityType"`);
  const registry=Object.fromEntries(rows.map(row=>[row.entityType,Object.freeze(row.ids)]));
  for (const [model,count] of Object.entries(manifest.expectedCounts))
    if (registry[model]?.length!==count) throw new Error("Music archive readiness mismatch; operations blocked");
  return Object.freeze(registry);
}

type RegistryReader = { $queryRaw<T>(sql: Prisma.Sql): Promise<T> };
let privateReader: RegistryReader | undefined;
let privateRegistry: Promise<RetirementRegistry> | undefined;
/** Called before taking a transaction connection to avoid waiting on the same one-connection pool. */
export async function ensureMusicArchiveReady(): Promise<RetirementRegistry | undefined> {
  if (!musicRetirementEnabled()) return undefined;
  if (!privateReader) return undefined;
  return privateRegistry ??= loadRetirementRegistry(privateReader).catch(error=>{privateRegistry=undefined;throw error;});
}

type DmmfModel = { name: string; fields: readonly { name: string; type: string; kind: string; isList: boolean }[] };
// Prisma supplies different argument shapes from two generated clients.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>;
/** Both Prisma clients use this same boundary, including interactive transactions.
 * Explicit archive reads use the permission-checked, snapshot-only archive page.
 * Raw SQL callers must use musicRetirementSql; database guards protect all writers.
 */
export function retirementReadArgs(model: string, args: Args, models: readonly DmmfModel[], registry: RetirementRegistry): Args {
  const condition = musicRetirementWhere(model, registry);
  const existingAnd = args.where?.AND == null ? [] : Array.isArray(args.where.AND) ? args.where.AND : [args.where.AND];
  const next: Args = { ...args, where: { ...args.where, AND: [...existingAnd, condition] } };
  for (const selection of ["include", "select"] as const) {
    if (!args[selection]) continue;
    next[selection] = { ...args[selection] };
    for (const field of models.find(item => item.name === model)?.fields ?? []) {
      const requested = args[selection][field.name];
      if (!requested || field.kind !== "object" || !field.isList) continue;
      next[selection][field.name] = retirementReadArgs(field.type, requested === true ? {} : requested, models, registry);
    }
    const counts = next[selection]._count;
    if (counts?.select) {
      next[selection]._count = { ...counts, select: { ...counts.select } };
      for (const field of models.find(item => item.name === model)?.fields ?? []) {
        const requested = counts.select[field.name];
        if (requested && field.kind === "object" && field.isList)
          next[selection]._count.select[field.name] = { ...(requested === true ? {} : requested), where: {
            AND: [requested === true ? {} : requested.where ?? {}, musicRetirementWhere(field.type, registry)],
          } };
      }
    }
  }
  return next;
}
export function withMusicRetirement<T extends object>(client: T, models: readonly DmmfModel[]): T {
  if (!musicRetirementEnabled()) return client;
  const extensible = client as unknown as { $extends(extension: object): T };
  privateReader ??= client as unknown as RegistryReader;
  return extensible.$extends({ name: "music-operational-retirement", query: { $allModels: {
    async $allOperations({ model, operation, args, query }: { model: string; operation: string; args: Args; query: (args: Args) => unknown }) {
      if (["findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "groupBy"].includes(operation))
        return query(retirementReadArgs(model, args, models, (await ensureMusicArchiveReady())!));
      return query(args);
    },
  } } });
}
