# Historical timetable provenance review

Only the existing isolated music-opening Preview and `store-lubymusic` are affected. No data is deleted or rewritten.

## Confirmed historical UI load-test cohort: 35 sessions

Evidence: [PR #1095](https://github.com/rock7652-beep/steamfoot-booking/pull/1095), section “Music Pilot 實際壓測資料”, records 35 sessions dated September 21–26, 2026, created from the September–October group timetable. It explicitly says room assignments were simulated across nine rooms for UI load testing. Dates, class codes and teachers were based on the real source timetable. These are historical test copies, not fabricated source schedules and not the later verified student import.

The isolated database contains exactly the matching 35 session IDs (`music-luby-s-0921-1800-a` through the explicitly enumerated September 26 entries), created in three batches on September 24 at 12:36:46.123, 12:37:03.425 and 12:37:25.106 UTC. Request keys identify the original music pilot. Read-only relationship checks found 0 bookings, 0 fee payments, 0 moves and 0 waitlist records, plus 35 compensation snapshots. Absence of bookings alone was not used as proof; the contemporaneous PR establishes the test purpose.

These exact IDs join the existing 186 verified legacy sessions, making 221. Shared session filtering and payroll partitioning now isolate their timetable and compensation records. No prefix-based runtime filtering is added; future or unreviewed records remain operational. The synthetic-customer list is unchanged.

## Retained records

- `cmui1vck70004lb04iuxp5r2y`: empty cancelled free trial, created September 26 and cancelled about 89 seconds later. Its template appears in a Preview demo setup script, but there is no direct evidence identifying this particular lesson as an acceptance test. Retained.
- `cmv7c079s0000le06rczclz01`: native trial linked to a manually created customer; the creation audit identifies a normal scheduling workflow. Administrator identity or a trial name does not prove synthetic provenance. Retained.
- 28 verified imported sessions and 2 subsequent source-linked sessions remain operational.

The reviewed 253 sessions therefore partition as 221 legacy and 32 operational (30 source-linked and 2 unproven). Classification is reversible through the explicit source list; underlying bookings, balances and scheduling-resource guards are unchanged. Source data changing after this audit requires a fresh review.
