"use client";
import {useCallback,useState,type ButtonHTMLAttributes,type ReactNode} from "react";
import {ServiceCardSummary} from "./service-card-summary";

/** Shared calendar preview. Touch and click keep the original detail action. */
export function ScheduleSummaryButton({summary,onPointerEnter,onPointerLeave,onFocus,onBlur,onClick,title,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{summary?:ReactNode}){
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
 const close=useCallback(()=>setAnchor(null),[]);
 return <>
  <button {...props} title={summary?undefined:title}
   onPointerEnter={event=>{onPointerEnter?.(event);if(summary&&event.pointerType!=="touch")setAnchor(event.currentTarget);}}
   onPointerLeave={event=>{onPointerLeave?.(event);close();}}
   onFocus={event=>{onFocus?.(event);if(summary)setAnchor(event.currentTarget);}}
   onBlur={event=>{onBlur?.(event);close();}}
   onClick={event=>{close();onClick?.(event);}}/>
  {anchor&&summary&&<ServiceCardSummary anchor={anchor} onClose={close}>{summary}</ServiceCardSummary>}
 </>;
}
