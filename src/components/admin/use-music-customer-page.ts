"use client";
import {useEffect,useState} from "react";
import {isMusicPreviewPage,subscribeMusicFinanceChange} from "@/lib/music-finance-sync";
import type {CourseCustomerPage} from "@/server/queries/course-customer-page";

/** Preserve server filters/visibility; new customer profiles require the existing page loader. */
export function useMusicCustomerPage(source:CourseCustomerPage|undefined,query:string,ids:string[],enabled:boolean,refresh:()=>void){
 const [live,setLive]=useState<{source:typeof source;query:string;data:CourseCustomerPage}|null>(null);
 const knownIds=JSON.stringify(ids);
 useEffect(()=>{
  if(!enabled||!source||!isMusicPreviewPage())return;
  let active=true,sequence=0;
  const dispose=subscribeMusicFinanceChange(kind=>{
   if(kind!=="purchase")return;
   const version=++sequence;
   void fetch(`/s/lubymusic/admin/dashboard/music-customers?${query}`,{credentials:"same-origin",cache:"no-store"})
    .then(async response=>{if(!response.ok)throw new Error("read failed");return response.json();})
    .then(result=>{
     if(!active||version!==sequence)return;
     const known=new Set<string>(JSON.parse(knownIds));
     if(!result.success||!result.data||!Array.isArray(result.data.rows)||result.data.rows.some((row:{id:string})=>!known.has(row.id))){refresh();return;}
     setLive({source,query,data:result.data});
    }).catch(()=>{if(active&&version===sequence)refresh();});
  });
  return()=>{active=false;sequence++;dispose();};
 },[source,query,knownIds,enabled,refresh]);
 return live&&live.source===source&&live.query===query?live.data:source;
}
