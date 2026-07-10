# CustomerIdentityLink guarded repair

This operator workflow repairs only SteamFoot LINE identity convergence. It
does not modify `Customer.healthProfileId`, HealthFlow profiles, measurements,
or coaching relationships.

## Controlled snapshot

The approved production snapshot is sensitive operational data and must not be
committed. Keep it in a controlled local path. Before review, record its exact
SHA-256 and candidate count through the approved secure channel.

The snapshot contains the minimum fields required for revalidation. LINE
identities are stored only as SHA-256 digests. Customer and User identifiers
remain operational identifiers and are why the snapshot stays outside Git.

## Dry-run

Set `IDENTITY_LINK_REPAIR_SNAPSHOT` to the controlled file and invoke the script
without `--execute`. The target project ref, snapshot SHA-256, snapshot count,
and maximum writes are all mandatory. Dry-run never opens a write transaction
and reports `dry_run_would_create` as `skipped` results.

Review `created`, `already_exists`, `skipped`, `conflict`, and `failed`. Do not
execute if any conflict or failure appears. A safe skip or already-existing
exact link may reflect a legitimate concurrent login and must not be forced.

## Execute

Execute only after explicit approval, from the reviewed fixed commit, with the
same snapshot and guard values plus `--execute`. Each candidate is re-read in a
Serializable transaction. Changed Customer, User, store, LINE identity, merge,
Account ownership, or existing-link state is skipped or rejected. The script
uses the existing `upsertCustomerIdentityLink` service and never updates the
source Customer, User, or Account.

After execution, immediately run read-only counts and verify the excluded
manual-review population is unchanged. Never loosen guards, force an overwrite,
or repair conflicts with ad-hoc SQL.
