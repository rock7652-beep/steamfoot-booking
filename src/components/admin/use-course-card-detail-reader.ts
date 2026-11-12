"use client";
import {usePanelReader} from '@/components/operations/panel-read-cache';
import type {browseCourseCards} from '@/server/actions/course-browse';
import {readNativeCourseCards} from '@/lib/course-card-read-client';
import {CUSTOMER_PLAN_PRELOAD_TTL} from './customer-plan-read-policy';
/** Display-only detail snapshots; every mutation retains its own authoritative check. */
type DetailReader=ReturnType<typeof usePanelReader<Parameters<typeof browseCourseCards>,Awaited<ReturnType<typeof browseCourseCards>>>>;
export function useCourseCardDetailReader(load?:typeof browseCourseCards,storeId='',revision=0):DetailReader{
 const fetcher:typeof browseCourseCards=load??readNativeCourseCards;
 return usePanelReader(load?'module-card':'course-card',fetcher,load?'':JSON.stringify([storeId,revision]),load?0:CUSTOMER_PLAN_PRELOAD_TTL);
}
