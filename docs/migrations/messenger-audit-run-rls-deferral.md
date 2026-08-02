# MessengerAuditRun RLS deferral

`20260729090000_add_messenger_audit_runs` is already present in Production's
Prisma migration ledger as a failed migration with checksum
`6edbd88d9fd2ab9e368b963d21f7d90ef2ed1f8e8c467a29c20f9a3c8d8e1488`.
Published migration files are immutable: this repository keeps that file byte
for byte compatible with the recorded checksum.

Production already has the enum, table, columns, defaults, primary key, foreign
keys, and indexes from that original migration. It currently has RLS disabled
and no `MessengerAuditRun` policy. A later attempt to append `ENABLE ROW LEVEL
SECURITY` to the historical migration changed its checksum and must not be
reused for recovery.

RLS is intentionally outside the migration-history recovery. Before a new,
separate RLS migration can be proposed, a read-only probe in the actual Vercel
Production build/runtime context must verify the runtime roles for both
`DATABASE_URL` and `DIRECT_URL` without logging connection strings or secrets:

- `current_user` and `session_user`
- `rolbypassrls` and `rolsuper`
- `MessengerAuditRun` table owner
- approved Production-project and pooler/direct-port checks

If the application runtime role is neither the table owner nor a
`BYPASSRLS` role, a least-privilege policy design is required first. Do not use
an unrestricted `USING (true)` or `WITH CHECK (true)` policy as a workaround.

Until that verification is complete, recovery may only reconcile the immutable
Messenger migration history and deploy the separately pending payment-split
migration. It must leave `MessengerAuditRun` RLS disabled.
