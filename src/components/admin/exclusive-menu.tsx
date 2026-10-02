"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const eventName = "admin-menu:open";
export function ExclusiveMenu({label,children,className="",triggerText,quiet=false}:{label:string;children:ReactNode;className?:string;triggerText?:string;quiet?:boolean}) {
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
  const [visited,setVisited]=useState(false);
  const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,left:0});
  useEffect(()=>{
    const other=(event:Event)=>{if((event as CustomEvent<string>).detail!==id)setOpen(false);};
    window.addEventListener(eventName,other);return()=>window.removeEventListener(eventName,other);
  },[id]);
  useEffect(()=>{
    if(!open)return;
    const pointer=(event:PointerEvent)=>{if(!trigger.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();setOpen(false);trigger.current?.focus();}};
    const close=()=>setOpen(false);
    document.addEventListener("pointerdown",pointer);document.addEventListener("keydown",escape,true);window.addEventListener("resize",close);window.addEventListener("scroll",close,true);
    return()=>{document.removeEventListener("pointerdown",pointer);document.removeEventListener("keydown",escape,true);window.removeEventListener("resize",close);window.removeEventListener("scroll",close,true);};
  },[open]);
  return <div className={className}><button ref={trigger} type="button" aria-label={label} aria-expanded={open} aria-controls={open?id:undefined} className={`min-h-11 min-w-11 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary-600 ${quiet ? "text-earth-700 hover:bg-earth-100" : "border border-earth-200 bg-white"}`} onClick={()=>{
    const rect=trigger.current?.getBoundingClientRect();if(rect)setPosition({left:Math.max(8,Math.min(rect.right-180,window.innerWidth-188)),top:Math.max(8,rect.bottom+150>window.innerHeight?rect.top-144:rect.bottom+4)});
    setVisited(true);if(!open)window.dispatchEvent(new CustomEvent(eventName,{detail:id}));setOpen(!open);
  }}>{triggerText ?? label}</button>{(open||visited)&&createPortal(<div ref={menu} id={id} hidden={!open} style={position} className="fixed z-[200] max-h-[calc(100dvh-1rem)] w-44 overflow-auto rounded-xl border border-earth-200 bg-white p-2 shadow-lg" onClick={event=>{if((event.target as HTMLElement).closest("button:not([data-menu-keep-open])"))setOpen(false);}}>{children}</div>,document.body)}</div>;
}
