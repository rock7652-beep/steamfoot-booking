"use client";
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {browseCourseCards} from '@/server/actions/course-browse';
import {readNativeCourseCards} from '@/lib/course-card-read-client';
export const CUSTOMER_PLAN_PRELOAD_TTL=15_000;
type CardArgs=Parameters<typeof browseCourseCards>;
type CardResult=Awaited<ReturnType<typeof browseCourseCards>>;
type CardReader=ReturnType<typeof usePanelReader<CardArgs,CardResult>>;
/** Lists are short-lived display data. Card detail and all writes retain authoritative reads. */
export function useCustomerCardReader({load,native=false,revision=0}:{load?:typeof browseCourseCards;native?:boolean;revision?:number}):CardReader{
 return usePanelReader(load?'module-card-browse':'course-card-browse',load??(native?readNativeCourseCards:browseCourseCards),String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
}
