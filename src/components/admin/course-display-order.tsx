"use client";
import {useRef,useState,type PointerEvent} from "react";
import {toast} from "sonner";
import {saveCourseDisplayOrder} from "@/server/actions/course-display-order";
import {emptyCourseOrder,moveCourseRow,orderCourseRows,type CourseOrderKind,type CourseOrderSnapshot} from "@/lib/course-display-order";

export function useCourseDisplayOrder<T extends {id:string}>(kind:CourseOrderKind,source:T[],initial:CourseOrderSnapshot=emptyCourseOrder,enabled=true,group:(row:T)=>boolean=()=>true) {
  const [saved,setSaved]=useState(initial);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const drag=useRef<{id:string;target:string;y:number}|null>(null);
  const rows=orderCourseRows(source,saved.ids);
  const ranks=new Map(rows.map((r,i)=>[r.id,i]));
  async function persist(ids:string[],undo=true){
    if(lock.current)return;
    lock.current=true;setBusy(true);
    const previous={...saved,ids:rows.map(r=>r.id)};setSaved({...saved,ids});
    try{
      const result=await saveCourseDisplayOrder({kind,ids,revision:saved.revision});
      if(!result.success)throw new Error(result.error);
      const next={ids,revision:result.revision};setSaved(next);
      toast.success("排序已儲存",undo?{action:{label:"復原",onClick:()=>{void restore(previous.ids,next);}}}:undefined);
    }catch(e){setSaved(previous);toast.error(e instanceof Error?e.message:"排序儲存失敗，已恢復原順序");}
    finally{lock.current=false;setBusy(false);}
  }
  async function restore(ids:string[],current:CourseOrderSnapshot){
    if(lock.current)return;
    lock.current=true;setBusy(true);
    try{const result=await saveCourseDisplayOrder({kind,ids,revision:current.revision});if(!result.success)throw new Error(result.error);setSaved({ids,revision:result.revision});toast.success("已復原排序");}
    catch(e){toast.error(e instanceof Error?e.message:"復原失敗");}finally{lock.current=false;setBusy(false);}
  }
  function move(from:string,to:string){
    const a=source.find(r=>r.id===from),b=source.find(r=>r.id===to);
    if(!enabled||busy||!a||!b||group(a)!==group(b)||from===to)return;
    void persist(moveCourseRow(rows.map(r=>r.id),from,to));
  }
  function pointerMove(e:PointerEvent<HTMLButtonElement>){
    if(!drag.current)return;
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>(`[data-course-order="${kind}"]`);
    if(target?.dataset.rowId)drag.current.target=target.dataset.rowId;
    let parent:HTMLElement|null=e.currentTarget.parentElement;
    while(parent){if(parent.scrollHeight>parent.clientHeight&&/(auto|scroll)/.test(getComputedStyle(parent).overflowY))break;parent=parent.parentElement;}
    const scroll=parent??document.scrollingElement;
    const bounds=parent?.getBoundingClientRect();const top=bounds?.top??0,bottom=bounds?.bottom??window.innerHeight;
    if(e.clientY<top+60)scroll?.scrollBy(0,-18);else if(e.clientY>bottom-60)scroll?.scrollBy(0,18);
  }
  return {rows,busy,compare:(a:T,b:T)=>(ranks.get(a.id)??0)-(ranks.get(b.id)??0),rowProps:(id:string)=>({"data-course-order":kind,"data-row-id":id}),handle:(id:string,name:string)=><button type="button" disabled={!enabled||busy} aria-label={`拖曳排序 ${name}`} title={enabled?"拖曳調整順序；鍵盤上下鍵也可移動":"清除篩選後可拖曳排序"} className="mr-1 inline-flex h-10 w-7 touch-none select-none items-center justify-center rounded text-earth-500 hover:bg-earth-100 disabled:opacity-30 cursor-grab active:cursor-grabbing" onPointerDown={e=>{if(!enabled||busy)return;drag.current={id,target:id,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={pointerMove} onPointerUp={e=>{const d=drag.current;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>(`[data-course-order="${kind}"]`);if(d&&target?.dataset.rowId)move(d.id,target.dataset.rowId);}} onPointerCancel={()=>{drag.current=null;}} onKeyDown={e=>{if(e.key!=="ArrowUp"&&e.key!=="ArrowDown")return;e.preventDefault();const row=source.find(r=>r.id===id);const same=rows.filter(r=>row&&group(r)===group(row));const index=same.findIndex(r=>r.id===id)+(e.key==="ArrowUp"?-1:1);if(same[index])move(id,same[index].id);}}>⋮⋮</button>};
}
