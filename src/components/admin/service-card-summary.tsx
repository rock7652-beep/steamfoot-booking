"use client";
import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

/** Informational only: escape the calendar's clipped scroller without taking card clicks. */
export function ServiceCardSummary({anchor,onClose,children}:{anchor:HTMLElement;onClose:()=>void;children:ReactNode}){
 const panel=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState<{left:number;top:number}|null>(null);
 useLayoutEffect(()=>{
  const node=panel.current;if(!node)return;
  const rect=anchor.getBoundingClientRect(),size=node.getBoundingClientRect(),gap=6,edge=8;
  const above=rect.top-edge,below=window.innerHeight-rect.bottom-edge;
  const top=above>=size.height+gap||above>below?rect.top-size.height-gap:rect.bottom+gap;
  setPosition({left:Math.max(edge,Math.min(rect.left,window.innerWidth-size.width-edge)),top:Math.max(edge,Math.min(top,window.innerHeight-size.height-edge))});
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
  window.addEventListener('scroll',onClose,true);window.addEventListener('resize',onClose);window.addEventListener('keydown',escape);
  return()=>{window.removeEventListener('scroll',onClose,true);window.removeEventListener('resize',onClose);window.removeEventListener('keydown',escape);};
 },[anchor,onClose,children]);
 return createPortal(<div ref={panel} aria-hidden="true" data-service-card-summary className="pointer-events-none fixed z-[160] w-max max-w-[calc(100vw-1rem)] space-y-1 break-words rounded-lg border border-earth-200 bg-white p-3 text-sm leading-5 text-earth-900 shadow-lg" style={{...position,maxWidth:'min(18rem, calc(100vw - 1rem))',maxHeight:'calc(100dvh - 1rem)',overflow:'hidden',visibility:position?'visible':'hidden'}}>{children}</div>,document.body);
}
