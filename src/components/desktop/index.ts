/**
 * Desktop primitives — 後台桌機版重構 Phase 2
 *
 * 對照 `design/04-phase2-plan.md`。後台頁面從此一律從這支 barrel 引入。
 */

export { PageShell } from "./page-shell";
export { PageHeader } from "./page-header";
export { KpiStrip } from "./kpi-strip";
export type { KpiStripItem, KpiTone } from "./kpi-strip";
export { DataTable } from "./data-table";
export type { Column, ColumnAlign, ColumnPriority } from "./data-table";
export { SideCard } from "./side-card";
export { EmptyRow } from "./empty-row";
export { InfoList } from "./info-list";
export type { InfoListItem } from "./info-list";
export { FormShell } from "./form-shell";
export { FormSection } from "./form-section";
export { FormGrid } from "./form-grid";
export { StickyFormActions } from "./sticky-form-actions";
