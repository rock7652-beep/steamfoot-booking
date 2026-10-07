import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@prisma/client";

export type AuditActor = {
  id: string;
  name?: string | null;
  role?: string;
  loginRecordId?: string | null;
  storeId?: string | null;
};
const scope = new AsyncLocalStorage<AuditActor | null | "resolving">();
const deliveryScope = new AsyncLocalStorage<{ pending: boolean }>();
// Only module loading is shared, never session data. Load outside the resolving
// scope so concurrent first requests cannot inherit module initialization scope.
let sessionModule: Promise<typeof import("@/lib/session")> | undefined;

export function markAuditDeliveryPending() {
  const state = deliveryScope.getStore();
  if (state) state.pending = true;
}

async function scheduleDelivery() {
  try {
    const { after } = await import("next/server");
    after(async () => {
      try {
        const { deliverOperationAudits } = await import("@/server/services/operation-audit-outbox");
        await deliverOperationAudits(100);
      } catch { /* durable queue and cron retry remain authoritative */ }
    });
  } catch { /* no request context: cron/manual delivery */ }
}

/** Delivery uses the recorded actor, never the worker's current session. */
export function withoutAuditActor<T>(work: () => Promise<T>) {
  return scope.run(null, work);
}

export function currentAuditActor(): AuditActor | null {
  const value = scope.getStore();
  return value && value !== "resolving" ? value : null;
}

async function resolveActor(): Promise<AuditActor | null> {
  const current = scope.getStore();
  if (current !== undefined) return current === "resolving" ? null : current;
  const session = await (sessionModule ??= import("@/lib/session"));
  return scope.run("resolving", async () => {
    try {
      const user = await session.getCurrentUser();
      // Copy only verified identity fields; never retain a mutable session.
      return user ? Object.freeze({ id: user.id, name: user.name, role: user.role,
        loginRecordId: user.loginRecordId ?? null, storeId: user.storeId }) : null;
    } catch (error) {
      // Cron/OAuth setup has no request identity. Do not invent a login link.
      if (error instanceof Error && error.message.includes("outside a request scope")) return null;
      // A database/auth failure must not silently turn a verified staff action
      // into an unlinked mutation. The business transaction has not started.
      throw error;
    }
  });
}

type TransactionClient = { $executeRaw: (query: Prisma.Sql) => Promise<unknown> };
type Client = TransactionClient & {
  $transaction: (...args: unknown[]) => Promise<unknown>;
};

/** Stamp verified identity before acquiring the business transaction. SET LOCAL
 * is connection-local, resets on commit/rollback, and covers legacy raw SQL.
 * AsyncLocalStorage.run isolates concurrent requests; it never uses enterWith.
 * This wrapper leaves business authorization to the existing server guards. */
export function withAuditDatabaseContext<T extends object>(original: T, auditModel = false): T {
  if (auditModel) {
    const extensible = original as unknown as { $extends: (extension: object) => T };
    original = extensible.$extends({ query: { auditLog: {
      async create({ args, query }: { args: { data: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
        const actor = await resolveActor();
        if (actor && actor.id === args.data.actorUserId) {
          args = { ...args, data: { ...args.data, actorNameSnapshot: actor.name ?? null,
            actorRoleSnapshot: actor.role ?? null, loginRecordId: actor.loginRecordId ?? null,
            ...(args.data.storeId == null && actor.role !== "ADMIN" ? { storeId: actor.storeId ?? null } : {}),
          } };
        }
        return query(args);
      },
    } } });
  }
  const client = original as unknown as Client;
  return new Proxy(original, {
    get(target, key, receiver) {
      if (key === "$transaction") return async (work: unknown, ...options: unknown[]) => {
        const actor = await resolveActor();
        return scope.run(actor, () => deliveryScope.run({ pending: false }, async () => {
          const statement = Prisma.sql`SELECT set_config('steamfoot.audit_actor', ${JSON.stringify(actor)}, true)`;
          if (typeof work === "function") {
            const result = await client.$transaction.call(original, async (tx: TransactionClient) => {
              await tx.$executeRaw(statement);
              return work(tx);
            }, ...options);
            if (deliveryScope.getStore()?.pending) await scheduleDelivery();
            return result;
          }
          if (Array.isArray(work)) {
            const result = await client.$transaction.call(original, [client.$executeRaw(statement), ...work], ...options) as unknown[];
            return result.slice(1);
          }
          throw new TypeError("Unsupported transaction input");
        }));
      };
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
