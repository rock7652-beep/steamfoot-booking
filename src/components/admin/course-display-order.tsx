"use client";
import {useEffect,useId,useRef,useState,type PointerEvent} from "react";
import {toast} from "sonner";
import {saveCourseDisplayOrder} from "@/server/actions/course-display-order";
import {emptyCourseOrder,moveCourseRow,orderCourseRows,type CourseOrderWriter,type CourseOrderKind,type CourseOrderSnapshot} from "@/lib/course-display-order";

export function useCourseDisplayOrder<T extends {id:string}>(kind:CourseOrderKind,source:T[],initial:CourseOrderSnapshot=emptyCourseOrder,enabled=true,group:(row:T)=>boolean=()=>true,write:CourseOrderWriter=saveCourseDisplayOrder) {
  const [saved,setSaved]=useState(initial);
  const [pendingId,setPendingId]=useState<string|null>(null);
  const [error,setError]=useState<{id:string;message:string;retry?:()=>void}|null>(null);
  const busy=pendingId!==null;
  const [open,setOpen]=useState<string|null>(null);
  const feedbackId=useId();
  const moved=useRef(false);
  const lock=useRef(false);
  const mounted=useRef(false);
  const allowed=useRef(enabled);
  const revision=useRef(initial.revision);
  const drag=useRef<{id:string;target:string;y:number}|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{allowed.current=enabled;},[enabled]);
  const rows=orderCourseRows(source,saved.ids);
  const ranks=new Map(rows.map((r,i)=>[r.id,i]));
  async function persist(ids:string[],rowId:string,undo=true,current=saved){
    if(lock.current||!mounted.current||!allowed.current)return;
    // Toast actions can outlive the render that created them. Never apply an
    // older Undo/retry over a later successful order.
    if(revision.current!==current.revision){setError({id:rowId,message:"排序已變更，請重新確認目前順序。"});return;}
    lock.current=true;setPendingId(rowId);setError(null);setOpen(null);
    const previous={...current,ids:undo?rows.map(r=>r.id):current.ids};
    setSaved({...current,ids});
    const rollback=(message:string)=>{
      setSaved(previous);
      setError({id:rowId,message,retry:()=>{void persist(ids,rowId,undo,previous);}});
    };
    try{
      const result=await write({kind,ids,revision:current.revision});
      if(!mounted.current)return;
      if(!result.success){rollback(result.error);return;}
      const next={ids,revision:result.revision};revision.current=result.revision;setSaved(next);
      if(undo)toast.success("排序已儲存",{id:`course-order-${kind}`,position:"bottom-center",duration:3500,style:{padding:"10px 14px",width:"min(320px, calc(100vw - 32px))"},action:{label:"復原",onClick:()=>{void persist(previous.ids,rowId,false,next);}}});
      else toast.success("已復原排序");
    }catch{
      if(mounted.current)rollback("連線中斷，已恢復原順序顯示。請重新整理核對後再試。");
    }finally{lock.current=false;if(mounted.current)setPendingId(null);}
  }
  function move(from:string,to:string){
    const a=source.find(r=>r.id===from),b=source.find(r=>r.id===to);
    if(!enabled||busy||!a||!b||group(a)!==group(b)||from===to)return;
    setOpen(null);
    void persist(moveCourseRow(rows.map(r=>r.id),from,to),from);
  }
  function pointerMove(e:PointerEvent<HTMLButtonElement>){
    if(!drag.current)return;
    if(Math.abs(e.clientY-drag.current.y)>5)moved.current=true;
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>(`[data-course-order="${kind}"]`);
    if(target?.dataset.rowId)drag.current.target=target.dataset.rowId;
    let parent:HTMLElement|null=e.currentTarget.parentElement;
    while(parent){if(parent.scrollHeight>parent.clientHeight&&/(auto|scroll)/.test(getComputedStyle(parent).overflowY))break;parent=parent.parentElement;}
    const scroll=parent??document.scrollingElement;
    const bounds=parent?.getBoundingClientRect();const top=bounds?.top??0,bottom=bounds?.bottom??window.innerHeight;
    if(e.clientY<top+60)scroll?.scrollBy(0,-18);else if(e.clientY>bottom-60)scroll?.scrollBy(0,18);
  }
  function adjacent(id:string,offset:number){
    const row=source.find(r=>r.id===id);
    const same=rows.filter(r=>row&&group(r)===group(row));
    return same[same.findIndex(r=>r.id===id)+offset]?.id;
  }
  return {rows,busy,compare:(a:T,b:T)=>(ranks.get(a.id)??0)-(ranks.get(b.id)??0),rowProps:(id:string)=>({"data-course-order":kind,"data-row-id":id}),handle:(id:string,name:string)=><span className="inline-flex max-w-48 shrink-0 flex-wrap items-center gap-1 align-middle">
    <button type="button" disabled={busy} style={{touchAction:"none"}} aria-label={`拖曳排序 ${name}`} aria-expanded={open===id} aria-describedby={pendingId===id||error?.id===id?`${feedbackId}-${id}`:undefined} title={enabled?"拖曳排序，或點一下選擇上移／下移":"清除篩選後可排序"} className="inline-flex h-6 w-8 select-none items-center justify-center rounded text-earth-500 hover:bg-earth-100 disabled:opacity-30 cursor-grab active:cursor-grabbing [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
      onClick={()=>{if(moved.current){moved.current=false;return;}if(!enabled){toast.info("請先清除搜尋與篩選，再調整排序");return;}setOpen(open===id?null:id);}}
      onPointerDown={e=>{moved.current=false;if(!enabled||busy)return;drag.current={id,target:id,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={pointerMove}
      onPointerUp={e=>{const d=drag.current;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>(`[data-course-order="${kind}"]`);if(d&&moved.current&&target?.dataset.rowId)move(d.id,target.dataset.rowId);}}
      onPointerCancel={()=>{drag.current=null;moved.current=true;}}
      onKeyDown={e=>{if(e.key==="Escape"){setOpen(null);return;}if(e.key!=="ArrowUp"&&e.key!=="ArrowDown")return;e.preventDefault();const target=adjacent(id,e.key==="ArrowUp"?-1:1);if(target)move(id,target);}}>⋮⋮</button>
    {open===id&&enabled&&<span className="inline-flex gap-1" aria-label={`${name}排序操作`}>
      <button type="button" disabled={busy||!adjacent(id,-1)} className="min-h-11 rounded border px-2 text-sm disabled:opacity-30" onClick={()=>{const target=adjacent(id,-1);if(target)move(id,target);}}>上移</button>
      <button type="button" disabled={busy||!adjacent(id,1)} className="min-h-11 rounded border px-2 text-sm disabled:opacity-30" onClick={()=>{const target=adjacent(id,1);if(target)move(id,target);}}>下移</button>
    </span>}
    {pendingId===id&&<span id={`${feedbackId}-${id}`} role="status" className="w-full whitespace-normal text-sm text-earth-500">儲存中…</span>}
    {error?.id===id&&<span id={`${feedbackId}-${id}`} role="alert" className="w-full whitespace-normal break-words text-sm text-red-700">{error.message}
      {error.retry&&<button type="button" disabled={busy||!enabled} className="min-h-11 rounded border px-3 text-sm disabled:opacity-50" onClick={error.retry}>重試</button>}
    </span>}
  </span>};
}
