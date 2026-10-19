"use client";
import {useEffect,useRef,useState,type RefObject} from "react";
import {useRetainedState,retainedString} from "@/components/operations/operation-scope";
export function useSportsCalendarState<T>(enabled:boolean,key:string,initial:T,valid:(value:unknown)=>value is T){
 const retained=useRetainedState(`sports-calendar:${key}`,initial,valid);
 const local=useState(initial);
 return enabled?retained:local;
}
export const calendarString=retainedString;
export const calendarDate=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+"T00:00:00Z"));
export const calendarMode=(v:unknown):v is "month"|"week"|"day"=>v==="month"||v==="week"||v==="day";
export const calendarResource=(v:unknown):v is "room"|"coach"=>v==="room"||v==="coach";
type Position={x:number;y:number};
const position=(v:unknown):v is Position=>!!v&&typeof v==="object"&&"x" in v&&"y" in v&&typeof v.x==="number"&&typeof v.y==="number"&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.y>=0;
/** Scope and sessionStorage lifecycle are owned by OperationScope; only UI coordinates persist. */
export function useSportsCalendarScroll(enabled:boolean,key:string,ref?:RefObject<HTMLElement|null>,ready=true){
 const [saved,setSaved]=useSportsCalendarState(enabled,`scroll:${key}`,{x:0,y:0},position);
 const latest=useRef(saved);useEffect(()=>{latest.current=saved;},[saved]);
 useEffect(()=>{
  if(!enabled||!ready)return;
  const node=ref?.current;const target=node??window;
  let frame=0,restoring=true,stopped=false;
  const restore=()=>{if(stopped)return;const p=latest.current;if(node)node.scrollTo({left:p.x,top:p.y,behavior:"instant"});else window.scrollTo({left:p.x,top:p.y,behavior:"instant"});};
  const save=()=>{if(restoring)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>setSaved({x:node?.scrollLeft??window.scrollX,y:node?.scrollTop??window.scrollY}));};
  const stop=()=>{stopped=true;restoring=false;observer?.disconnect();};
  const observer=typeof ResizeObserver==="undefined"?null:new ResizeObserver(restore);
  observer?.observe(node??document.body);frame=requestAnimationFrame(restore);
  const timer=setTimeout(stop,900);target.addEventListener("scroll",save,{passive:true});
  for(const name of ["pointerdown","wheel","touchstart","keydown"])target.addEventListener(name,stop,{once:true,passive:true});
  return()=>{clearTimeout(timer);cancelAnimationFrame(frame);observer?.disconnect();for(const name of ["pointerdown","wheel","touchstart","keydown"])target.removeEventListener(name,stop);target.removeEventListener("scroll",save);};
 },[enabled,key,ref,ready,setSaved]);
}
