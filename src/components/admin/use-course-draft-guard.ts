"use client";

import { useEffect } from "react";

const leaveEvent="course-draft-leave";
/** Check before changing the active-store cookie. */
export function requestCourseDraftLeave() {
  return window.dispatchEvent(new CustomEvent(leaveEvent,{cancelable:true,detail:{confirmed:false}}));
}

/** Block navigation only while a save is in flight; drafts can be discarded silently. */
export function useCourseDraftGuard(dirty:boolean,pending=false) {
  useEffect(()=>{
    if(!pending)return;
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    const navigate=(event:MouseEvent)=>{
      const link=(event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement|null;
      if(!link||link.target==="_blank"||link.hasAttribute("download")||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      const destination=new URL(link.href,window.location.href);
      if(destination.href===window.location.href||destination.hash&&destination.pathname===window.location.pathname&&destination.search===window.location.search)return;
      if(pending){event.preventDefault();event.stopPropagation();}
    };
    const leave=(event:Event)=>{
      const request=event as CustomEvent<{confirmed:boolean}>;
      if(event.defaultPrevented)return;
      if(pending){event.preventDefault();return;}
      request.detail.confirmed=true;
    };
    window.addEventListener(leaveEvent,leave);
    window.addEventListener("beforeunload",unload);
    document.addEventListener("click",navigate,true);
    return()=>{window.removeEventListener(leaveEvent,leave);window.removeEventListener("beforeunload",unload);document.removeEventListener("click",navigate,true);};
  },[dirty,pending]);
}
