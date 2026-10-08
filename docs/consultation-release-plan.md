# Consultation rollout after shared-card release

This is a review plan, not an executed production rollout. It supersedes the
release-bound-only statements in `consultation-hq-local-plan.md` for the composed
candidate. Two forms remain distinct; no historical Sheet rows are imported.

## Release composition

- Compose after reviewed shared-card PR #1249 and the approved public articles.
  Preserve their exact code, branch suppression, guide sandbox, and article/SEO
  deny prefixes. Publish the updated Draft PR #1251 only after actual main is
  verified to include #1249.
- Production behavior requires the reviewed positive Vercel/main/repository
  provenance. Unknown environments fail closed. The two named Preview branches
  each retain their own isolated connection checks. Consultation Preview also
  requires both explicit flags; its build never runs migrations.
- Keep `CONSULTATION_PREVIEW_INTAKE_ENABLED` unset/false in production. Keep
  `CONSULTATION_HQ_ENABLED` unset/false until the production schema is verified.
  This preserves the existing Sheet intake and avoids reads of the new tables.
- No new credentials, public table policies, automatic matching, notification
  retry worker, or automatic trial-store creation is required.

## Proposed production activation, requiring the release approval

1. Verify the final reviewed head/CI and production main guard; merge/deploy with
   the HQ feature disabled. Confirm the existing public intake/HQ still loads.
2. On the explicitly approved production project only, apply the reviewed manual
   transaction `docs/sql/20261008-consultation-leads.sql`. This creates exactly
   `ConsultationLead` and `ConsultationLeadActivity`, their indexes/constraints,
   and two trigger functions. It is not a Prisma automatic migration and does
   not import or update existing applications. Use transaction-local lock and
   statement timeouts to avoid an unbounded wait.
3. Verify the exact table/constraint/index/trigger definitions and server-role
   access; verify RLS is enabled and PUBLIC/anon/authenticated have no table
   access or policies. Keep the deliberate server-only access model.
4. Enable `CONSULTATION_HQ_ENABLED=true` for production and redeploy the exact
   approved code. Only new submissions then save to HQ before the existing Sheet
   receiver. Ordinary existing receiver notifications resume on production; no
   second notification channel is added. Verify with an approved test submission
   only if its resulting Sheet/email side effects are also authorized.
5. If receipt fails, disable the HQ flag and redeploy. Preserve already collected
   records and audit history. Do not delete tables or resend uncertain deliveries.

## Function advisory choice

The reviewed SQL pins both `SECURITY INVOKER` trigger functions to
`search_path = ''`. Their bodies use NEW/OLD records and built-in operations;
there are no unqualified table references or dynamic SQL. Local in-memory
PostgreSQL tests execute the full SQL, assert invoker/search-path metadata, and
exercise the triggers and access denial. This changes no role grants.

The already-tested isolated project still has the earlier functions. No ALTER
has been applied there. A separately approved narrow isolated update can set the
two function search paths before final real-PostgreSQL revalidation; never rerun
the table-creation transaction over existing tables or erase its test history.
The no-client-policy RLS advisory is intentional, not a reason to add a policy.
The proposed isolated change is limited to these statements, inside a transaction
with local lock/statement timeouts, followed by catalog and trigger verification:

```sql
ALTER FUNCTION public.guard_consultation_lead_update() SET search_path = '';
ALTER FUNCTION public.guard_consultation_activity_append_only() SET search_path = '';
```

They are a reviewable future operation, not a command to run during deployment.

Reference: https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0011_function_search_path_mutable

## Separate publication and data actions

- Google Apps Script titles: `scripts/store-check/Code.gs` changes the inquiry
  title to “店家需求諮詢／體驗意願”; `scripts/trial-intake-apps-script.gs` changes the
  formal-opening title to “新的體驗版開通資料”. GitHub/Vercel deployment does not
  publish these scripts. Update only their verified existing deployment after
  the script/deployment target and authorization are established. Keep recipients,
  receiver URL, Sheet columns, and existing requestId behavior unchanged.
- Website/Facebook/Instagram fields work with the existing Sheet notes column;
  they do not depend on the title-only Apps Script publication.
- Historical import remains excluded. The local tool is dry-run-only and cannot
  establish that old rows were synchronized. Any future import needs reviewed
  source rows, stable original requestIds, target conflict checks, and explicit
  approval. Do not fabricate email fields or infer business associations.

## Acceptance evidence and limits

The earlier isolated Preview at f9c81ec passed real browser inquiry submission,
unsafe URL rejection, optional blank URLs, retained safe links, two appended
contact notes, explicit manual association, reciprocal navigation, and status
change. Desktop and a live 390x844 preview iframe had no observed horizontal
overflow; physical mobile/iPad/Safari were not tested. Two marked inquiry rows,
one marked opening application, and four activities remain as audit evidence.
Both inquiries are terminal NOT_SENT_PREVIEW with null attempt/confirmation
stamps; the formal application notification is DISABLED.

Those UI results describe f9c81ec, not the new composed candidate. Final release
requires its own exact-head CI, composed guard checks, and controlled Preview
smoke. Do not describe local PGlite checks as real hosted PostgreSQL acceptance.
