"use client";
import {CourseCustomerBookings} from "./customer-bookings";
import {CourseCardEntries} from "./card-entries";
import type {CourseCardView} from "./member-workspace";
import type {CourseCustomerSource} from "./member-source";
/** All reads remain scoped to the selected customer and selected plan. */
export function CoursePlanUsageHistory({card,customerId,source,music=false}:{card:CourseCardView;customerId:string;source?:CourseCustomerSource;music?:boolean}){
 return <div className="min-w-0"><CourseCustomerBookings customerId={customerId} cardId={card.id} load={source?.bookings} music={music} serviceMode={!!source} sessionUnitLabel={source?.sessionUnitLabel} compact/><CourseCardEntries card={card} sessionUnitLabel={source?.sessionUnitLabel} entryLabels={source?.entryLabels}/></div>;
}
