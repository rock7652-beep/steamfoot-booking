# PR 3-C2 — Referral template favorites and recent usage

## Goal

Make the official referral template center faster for returning store managers by adding per-store favorites and recent activity.

## Product scope

- Favorite / unfavorite an official template.
- “My favorites” section scoped to the authenticated store.
- Recent preview, apply, and save activity.
- Store isolation on every read and write.
- Existing official template catalog remains code-defined.
- No public/shared template authoring in this PR.
- No ranking or conversion claims in this PR.

## Planned data model

### ReferralShareTemplateFavorite

- `id`
- `storeId`
- `templateId`
- `createdAt`
- unique `(storeId, templateId)`
- indexed by `(storeId, createdAt)`

### ReferralShareTemplateUsage

- `id`
- `storeId`
- `templateId`
- `action` (`PREVIEW`, `APPLY`, `SAVE`)
- `createdAt`
- indexed by `(storeId, createdAt)` and `(storeId, templateId, createdAt)`

## Authorization and isolation

- Derive `storeId` from the authenticated server session only.
- Never accept caller-provided `storeId` as authority.
- Require the existing settings permission for mutation endpoints.
- Validate `templateId` against the official code-defined catalog before writes.
- Read queries always filter by the authenticated store.

## Validation plan

- Prisma schema and migration review.
- Backend authorization tests.
- Cross-store isolation tests.
- Duplicate favorite idempotency tests.
- Invalid template ID rejection tests.
- UI tests for favorites and recent activity.
- Targeted Vitest, ESLint, `git diff --check`, full build, and Preview smoke.

## Safety

- Draft PR only.
- Do not merge without explicit approval.
- Do not apply migration to Production.
- Do not manually deploy Production.
- Do not print secrets.
