import "server-only";

type Actor = { id: string; name?: string | null; role?: string; loginRecordId?: string | null };
type Snapshot = { actorNameSnapshot: string | null; actorRoleSnapshot: string | null; loginRecordId: string | null };
// Object identity cannot survive client serialization. Concurrent sessions for
// one account stay distinct; no process-wide lookup by user ID.
const verified = new WeakMap<object, { id: string; snapshot: Snapshot }>();

/** Called only after the session has been verified by the server auth layer. */
export function registerAuditActor<T extends Actor>(user: T): T {
  verified.set(user, { id: user.id, snapshot: Object.freeze({
    actorNameSnapshot: user.name ?? null,
    actorRoleSnapshot: user.role ?? null,
    loginRecordId: user.loginRecordId ?? null,
  }) });
  return user;
}

/** Synchronous: safe inside a transaction with a single database connection. */
export function auditActorData(user: object | undefined, actorUserId: string): Partial<Snapshot> {
  const actor = user ? verified.get(user) : undefined;
  return actor?.id === actorUserId ? actor.snapshot : {};
}

export function hasVerifiedAuditActor(user: object | undefined, actorUserId: string) {
  return !!user && verified.get(user)?.id === actorUserId;
}
