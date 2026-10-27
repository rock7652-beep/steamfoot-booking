# Completed profile remains in onboarding

## Evidence

- Production `ccd368d85dc1f303c8b472d9a509ce91edc7b33e`, deployment `dpl_BmcFrBqbVuzNLog3DUzD1wffUCrD`.
- The user supplied mobile LIFF screenshots showing a successful registration toast followed by the same onboarding form.
- Read-only inspection confirmed a newly created Silverlily membership with an identity link and saved basic data. No account or profile was modified by this investigation.
- Runtime logs confirmed subsequent profile reads resolved the same current-store membership through its identity link. The exact original query string was not available in the runtime logs; the user was asked for the current URL.
- The server page previously treated `complete=1` as onboarding even when persisted data was complete. It depended on client session synchronization and navigation to exit that state. The return destination also allowed the profile page itself.

## Change

Redirect completed onboarding on the server, using the existing saved-profile checks and destination resolver. Keep incomplete registrations and ordinary profile edits available. Preserve valid interrupted flows within the same store; reject a return to the profile page, another store or an external site.

This changes no membership ownership, authentication, permissions, stored customer data, financial records or notification settings. The default destination remains My Plans; existing module routing decides the appropriate portal.

## Validation and limits

- Five targeted test files: 32 tests pass, including persisted completion with identity-link ownership and a null legacy customer user ID, incomplete registration, normal edits, booking continuation and return-loop prevention.
- No layout, field, button or responsive CSS changed. The supplied phone screenshots are the production baseline, not a post-fix visual acceptance result.
- Connected-browser/LINE client reproduction and post-fix mobile acceptance remain pending. Do not claim the screenshot's precise navigation cause was reproduced solely from these tests.
- No production deployment, migration or database write is part of this PR. Automatic branch deployment is disabled.

## Release check

After approval, verify one flow: completed Silverlily registration leaves the form, then reopening the LIFF entry shows the member portal. Do not repeat registration or create a second membership. The separate authorized one-recipient LINE test remains pending.
