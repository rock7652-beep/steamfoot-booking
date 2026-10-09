"use client";

import { useEffect } from "react";

/** Preserve course form input when leaving through sidebar links or reloading. */
export function useCourseDraftGuard(dirty:boolean,pending=false) {
  useEffect(()=>{
    if(!dirty&&!pending)return;
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    const navigate=(event:MouseEvent)=>{
      const link=(event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement|null;
      if(!link||link.target==="_blank"||link.hasAttribute("download")||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      const destination=new URL(link.href,window.location.href);
      if(destination.href===window.location.href||destination.hash&&destination.pathname===window.location.pathname&&destination.search===window.location.search)return;
      if(pending||!window.confirm("尚有未儲存的修改，確定離開？")){event.preventDefault();event.stopPropagation();}
    };
    window.addEventListener("beforeunload",unload);
    document.addEventListener("click",navigate,true);
    return()=>{window.removeEventListener("beforeunload",unload);document.removeEventListener("click",navigate,true);};
  },[dirty,pending]);
}
