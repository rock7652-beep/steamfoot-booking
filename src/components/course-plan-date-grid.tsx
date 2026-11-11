"use client";
import {PlanUsageGrid} from '@/components/admin/plan-usage-grid';
import type {CoursePlanDateGrid as Grid} from '@/server/queries/course-phone-plan-grids';
export function CoursePlanDateGrid({grid,cardId}:{grid:Grid;cardId:string}) {
 return <PlanUsageGrid unitLabel="堂" progress={{available:true,total:grid.total,completed:grid.completed??grid.dates.map((date,i)=>({id:`${cardId}:${i}`,date})),voided:(grid.voidedDates??[]).map((date,i)=>({id:`void:${cardId}:${i}`,date}))}}/>;
}
