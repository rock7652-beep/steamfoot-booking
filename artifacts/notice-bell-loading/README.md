# Shared notification bell loading — 2026-10-21

Affected entrances: Steamfoot and course (music/sports) dashboard headers, including HQ selected-store views. HQ platform-only views, denied booking access and disabled stores retain their visibility rules.

The server layout starts a minimal switch lookup in parallel with its other reads. Enabled bells are present in server HTML before any client request. Unknown counts have no badge. Background refresh reads only the scoped pending count; list snapshots and handling permission checks run after opening. Requests use the existing scoped panel reader with TTL 0, generation checks and mutation invalidation.

Validation:

- 82 targeted unit/UI tests pass, including both modules' server HTML before unresolved summary/list requests, late-summary rejection, summary-only queries, authorization, disabled settings, mark/undo and original-work preservation.
- TypeScript and changed-source ESLint pass.
- Synthetic Chromium fixture passes 1366×900, 1920×1080, 1024×768, 768×1024, 560×800 and 390×844; no horizontal overflow, mark/undo/error restoration, target callback, underlying draft and settings toggles verified. Results are recorded beside this file. Existing visual references: ../steamfoot-store-notices/desktop.png and ipad.png; layout is unchanged.
- This is fixture coverage, not a signed-in production booking flow, physical iPad test or production latency measurement. First list fetch still needs network/server time.

Reproduce: `node scripts/qa/steamfoot-store-notices-browser.mjs`.
