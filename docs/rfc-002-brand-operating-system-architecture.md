# RFC-002: Brand Operating System Architecture

> Status: Draft v1
> Date: 2026-07-02
> Scope: Architecture review and product definition only

## 1. Product Definition

Brand Mode is a cross-store brand confidence and growth dashboard. It helps HQ
understand where the brand exists, how it is growing, and which regions or
stores deserve attention.

It is not store control, staff management, ERP, POS, settlement, or operational
auditing.

## 2. North Star

> Can this screen make people trust the brand more?

Brand Dashboard should answer brand-level questions:

- Where does the brand currently operate?
- How large is the brand footprint?
- Which regions are developing momentum?
- Which stores deserve attention?

It should not become a tool for controlling individual store operators.

## 3. Relationship to Store Organization v1

Brand Mode must have an independent brand scope.

Do not use `Store.parentStoreId` as the Brand Dashboard analysis scope.

`parentStoreId` belongs to Store Organization v1. Its boundary is an
organization view relationship only. It does not represent ownership,
management authority, revenue attribution, settlement, or brand analysis scope.

Brand Mode is an HQ brand view, not an upper store viewing descendant stores.

## 4. Homepage Information Architecture

The Brand Dashboard homepage keeps four sections:

1. Brand Footprint
2. Brand Scale
3. Regional Overview
4. Store Overview

The top-right area must show:

```text
資料更新於：YYYY/MM/DD HH:mm
```

This timestamp is part of the trust signal. If the dashboard uses aggregates,
cache, or snapshots, users must understand the freshness of the data.

## 5. Period Selection

Brand Dashboard must include period selection from v1.

Initial period options:

- 本月
- 近 30 天
- 今年
- 自訂期間

All homepage KPIs must use the same selected period. Without a shared period,
metrics such as total visitors, total revenue, and average monthly revenue per
store become semantically ambiguous.

Date range handling must follow the project timezone rules in
`docs/date-time-rules.md` and use the shared helpers in `src/lib/date-utils.ts`.
Do not manually compute timezone offsets.

## 6. Homepage KPI Scope

Brand Dashboard v1 should keep homepage KPIs small and stable.

Recommended v1 homepage KPIs:

- 店數
- 活躍店數
- 總來客數
- 總營業額
- 平均每店月營業額

P2 candidates:

- 新客數
- 回訪率
- 成長率

These are useful brand-health signals, but they should not be included in PR-1.
They require clearer definitions and stronger data confidence.

## 7. Performance Architecture

The homepage must avoid per-card and per-store query loops.

Recommended query shape:

- One brand period summary query
- One regional summary query
- One paginated or limited store summary query
- One map dataset derived from regional aggregates

Rules:

- Do not issue one query per KPI card.
- Do not issue one query per region.
- Do not issue one query per store.
- Every query must include explicit brand scope and date range semantics.
- Cache keys must include brand scope and selected period.
- Store overview must support pagination or an initial limit.

## 8. Data Architecture Guidance

This RFC does not define schema, migration, or implementation details. It only
defines data responsibility boundaries.

Suitable aggregate candidates:

- Brand period summary: store count, active store count, visitors, revenue,
  average monthly revenue per store
- Regional period summary: region, store count, visitors, revenue
- Store period summary: store, region, visitors, revenue

Suitable cache candidates:

- Brand Dashboard homepage snapshot
- Taiwan administrative map metrics
- Store summary first page

Potential future materialized view or snapshot candidates:

- Monthly brand summary
- Monthly regional summary
- Monthly store summary

Suitable direct-query candidates:

- Store basic profile data
- Early-stage current-period summary while store count remains small
- Drill-down pages with filters and pagination

Materialized views are not part of PR-1.

## 9. Scalability

At 100 stores, the homepage architecture remains valid if regional and store
summaries are aggregated and the store list is paginated.

At 300 stores, the homepage should not center on a full store table. It should
emphasize:

- Brand footprint
- KPI summary
- Regional summary
- Attention signals
- Drill-down navigation

At that scale, monthly snapshots or materialized views will likely become
necessary for stable dashboard performance.

## 10. ERP Risk Boundary

Brand Dashboard must avoid becoming ERP.

High-risk directions:

- Cross-store write actions
- Store control workflows
- Staff management
- Individual staff or owner ranking
- Settlement, commission, payroll, or cash reconciliation
- POS-style transaction operation
- Operational audit dashboards

The homepage should answer whether the brand is becoming stronger. It should
not become a control room for managing people.

## 11. PR-1 Boundary: Brand Dashboard Foundation

PR-1 should be foundation only.

Allowed scope:

- Route foundation
- HQ permission boundary
- Data query interface
- Layout skeleton
- Empty state
- Minimal summary

Explicit non-goals:

- Ranking
- ERP workflows
- Cross-store writes
- Complex trends
- Materialized views
- Schema changes
- Migrations
- Full dashboard implementation

PR-1 should establish the surface and boundaries before building the complete
Brand Dashboard.
