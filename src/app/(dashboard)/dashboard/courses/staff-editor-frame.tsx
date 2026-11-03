"use client";
import type {ReactNode} from "react";
import {RightSheet} from "@/components/admin/right-sheet";
import {CourseStaffEditorTabs} from "./staff-editor-fields";

export const courseStaffEditorButton = "min-h-11 shrink-0 whitespace-nowrap rounded-xl border border-earth-200 bg-white px-3 py-2 text-sm text-primary-800 hover:bg-primary-50 disabled:opacity-50";

/** Original course personnel editor, shared by music, sports and Beauty adapters. */
export function CourseStaffEditorFrame({title,titleId,headerAction,items,value,onTabChange,onClose,locked=false,className="fitness-management-editor",width=920,maxHeight=680,fixedHeight=true,children}:{title:ReactNode;titleId:string;headerAction?:ReactNode;items:string[][];value:string;onTabChange:(id:string)=>void;onClose:()=>void;locked?:boolean;className?:string;width?:number;maxHeight?:number;fixedHeight?:boolean;children:ReactNode}){
 return <RightSheet className={className} presentation="centered" fixedHeight={fixedHeight} fitContent={!fixedHeight} maxHeight={maxHeight} open onClose={onClose} closeOnEscape={!locked} width={width} labelledById={titleId}>
  <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-earth-200 bg-primary-50/60 px-4 py-2">
   <h2 id={titleId} className="min-w-0 flex-1 break-words font-semibold">{title}</h2>
   {headerAction}
   <button type="button" className={courseStaffEditorButton} disabled={locked} onClick={onClose}>關閉</button>
  </header>
  {items.length>0&&<CourseStaffEditorTabs value={value} disabled={locked} items={items} onChange={onTabChange}/>}
  {children}
 </RightSheet>;
}
