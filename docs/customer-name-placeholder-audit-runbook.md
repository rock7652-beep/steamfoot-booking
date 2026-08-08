# Customer placeholder-name Production audit runbook

Goal: classify existing Production customers whose `Customer.name` is exactly `顧客`, without changing Production data.

## Safety boundary

- Production database: SELECT only.
- No UPDATE / INSERT / DELETE / MERGE / DDL.
- Do not reveal full phone numbers, LINE IDs, tokens, credentials, or other sensitive values in reports.
- Aggregate-first. Use short IDs or hashes only when case-level review is required.
- Do not infer or repair names from cross-store matches, fuzzy name similarity, or OAuth display names alone.

## Required output

1. Total `Customer.name = '顧客'` count.
2. Count by store.
3. Created/updated time distribution.
4. Count with usable phone values.
5. Count with same-store normalized-phone evidence for another concrete Customer name.
6. Duplicate-risk groups by same-store normalized phone.
7. Classify affected records:
   - **Safely recoverable**: exactly one same-store, provenance-backed concrete name source.
   - **Manual review**: multiple/conflicting sources or ambiguous ownership.
   - **Unrecoverable**: no verifiable source.

## Source review order

When a placeholder Customer needs case-level provenance review, prefer sources that can prove the submitted name belonged to that exact same-store customer flow, such as the original staff-created trial booking / lead / reservation payload or audit record. Do not treat a same phone number in another store as sufficient evidence.

## Relationship to PR #687

PR #687 fixes future staff-created trial bookings: when the same-store phone reuses a Customer whose name is exactly `顧客`, the submitted concrete trial name can replace that placeholder under the guarded path. This runbook is only for historical Production classification; it does not perform backfill or data repair.
