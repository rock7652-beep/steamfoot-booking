"use client";

import { useState, useTransition, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { switchActiveStore } from "@/server/actions/store-switch";
import { hqStoreSwitchDestination } from "@/lib/hq-navigation";
import { toast } from "sonner";
import { requestCourseDraftLeave } from "@/components/admin/use-course-draft-guard";

interface StoreOption {
  id: string;
  name: string;
  isDefault: boolean;
  isArchived?: boolean;
  industryModule?:string;
  address?:string|null;
}

interface StoreSwitcherProps {
  stores: StoreOption[];
  activeStoreId: string | null; // null = "__all__"
  collapsed?: boolean;
  /** Header 內嵌模式 — 更緊湊，dropdown 右對齊 */
  inline?: boolean;
}

const ALL_STORES_VALUE = "__all__";

export default function StoreSwitcher({
  stores,
  activeStoreId,
  collapsed = false,
  inline = false,
}: StoreSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [menuPosition, setMenuPosition] = useState({top:0,left:0,width:256,maxHeight:400,transform:"none"});
  const [moreBelow,setMoreBelow] = useState(false);
  const availableStores = stores.filter(store => !store.isArchived);
  const [search, setSearch] = useState("");
  const visibleStores = stores.filter((store) =>
    !store.isArchived && `${store.name} ${store.address??""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function stopBackgroundWheel(event: WheelEvent) {
      const menu = listRef.current;
      if (event.ctrlKey) return;
      if (!menu?.contains(event.target as Node) ||
          (event.deltaY < 0 && menu.scrollTop <= 0) ||
          (event.deltaY > 0 && menu.scrollTop + menu.clientHeight >= menu.scrollHeight - 1)) event.preventDefault();
    }
    function resize() {
      const rect=ref.current?.getBoundingClientRect();
      if(!rect)return;
      const topEdge=viewport?.offsetTop ?? 0;
      const leftEdge=viewport?.offsetLeft ?? 0;
      const bottom=topEdge+(viewport?.height ?? window.innerHeight);
      const right=leftEdge+(viewport?.width ?? window.innerWidth);
      const below=Math.max(0,bottom-rect.bottom-12);
      const above=Math.max(0,rect.top-topEdge-12);
      const downward=below>=240 || below>=above;
      const maxHeight=Math.max(0,Math.min(400,downward?below:above));
      const width=Math.min(inline||collapsed?288:Math.max(224,rect.width-24),right-leftEdge-16);
      const left=Math.max(leftEdge+8,Math.min(collapsed?rect.left:inline?rect.right-width:rect.left+12,right-width-8));
      setMenuPosition({top:downward?rect.bottom+4:rect.top-4,left,width,maxHeight,transform:downward?"none":"translateY(-100%)"});
    }
    function stopBackgroundTouch(event: TouchEvent) {
      if (!menuRef.current?.contains(event.target as Node))
        event.preventDefault();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {setOpen(false);ref.current?.querySelector<HTMLButtonElement>("button")?.focus();}
    }
    resize();
    window.addEventListener("resize", resize);
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    document.addEventListener("touchmove", stopBackgroundTouch, {
      passive: false,
    });
    document.addEventListener("keydown", onKey);
    document.addEventListener("wheel", stopBackgroundWheel, { passive: false });
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("wheel", stopBackgroundWheel);
      window.removeEventListener("resize", resize);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      document.removeEventListener("touchmove", stopBackgroundTouch);
      document.removeEventListener("keydown", onKey);
    };
  }, [open,inline,collapsed]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const currentLabel =
    activeStoreId === null
      ? "全部分店"
      : (stores.find((s) => s.id === activeStoreId)?.name ?? "未知分店") + (stores.find(s => s.id === activeStoreId)?.isArchived ? "（已封存）" : "");

  function handleSelect(value: string) {
    if(isPending || !requestCourseDraftLeave())return;
    setOpen(false);
    startTransition(async () => {
      const result = await switchActiveStore(value);
      if (result.success) {
        // A store change can switch the entire module layout and redirect.
        // Request a fresh document so the old router tree cannot leave a blank view.
        window.location.assign(hqStoreSwitchDestination(window.location.search,window.location.pathname,stores.find(store=>store.id===value)?.industryModule));
      } else {
        toast.error(result.error ?? "切換店舖失敗，已保留原店舖");
        router.refresh();
      }
    });
  }

  function updateScrollHint() {
    const list=listRef.current;
    setMoreBelow(!!list && list.scrollTop+list.clientHeight<list.scrollHeight-1);
  }
  useEffect(()=>{
    if(!open)return;
    selectedRef.current?.scrollIntoView?.({block:"nearest"});
    searchRef.current?.focus({preventScroll:true});
    const frame=requestAnimationFrame(updateScrollHint);
    const observer=typeof ResizeObserver==="undefined"?null:new ResizeObserver(updateScrollHint);
    if(listRef.current)observer?.observe(listRef.current);
    return ()=>{cancelAnimationFrame(frame);observer?.disconnect();};
  },[open]);
  useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(updateScrollHint);return ()=>cancelAnimationFrame(frame);},[search,open,stores,menuPosition.maxHeight]);
  const menu = open && createPortal(
    <div ref={menuRef} id={menuId} role="region" aria-label="分店清單"
      style={menuPosition}
      className="fixed z-[90] flex flex-col overflow-hidden rounded-lg border border-earth-200 bg-white shadow-lg">
      <div className="shrink-0 border-b border-earth-100 bg-white p-2">
        <p className="mb-1 break-words px-1 text-sm text-primary-800">目前：{currentLabel}</p>
        <input ref={searchRef} aria-label="搜尋分店" placeholder="搜尋店名或地址／地區" value={search}
          onChange={event=>{setSearch(event.target.value);if(listRef.current)listRef.current.scrollTop=0;}}
          className="min-h-11 w-full rounded-md border border-earth-200 px-3 text-base"/>
      </div>
      <div ref={listRef} onScroll={updateScrollHint} style={{WebkitOverflowScrolling:"touch",scrollbarGutter:"stable"}}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y">
        <button type="button" onClick={()=>handleSelect(ALL_STORES_VALUE)} aria-current={activeStoreId===null?"page":undefined}
          className={`flex min-h-11 w-full items-center gap-2 border-b border-earth-100 px-3 py-2 text-left text-sm hover:bg-earth-50 ${activeStoreId===null?"bg-primary-50 font-medium text-primary-700":"text-earth-600"}`}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-earth-300"/>全部分店
        </button>
        {stores.find(store=>store.id===activeStoreId)?.isArchived && <a href={`/hq/dashboard/stores/${activeStoreId}`} className="block min-h-11 px-3 py-3 text-sm text-amber-700">查看已封存店舖</a>}
        {visibleStores.map(store=><button key={store.id} type="button" ref={activeStoreId===store.id?selectedRef:undefined}
          aria-current={activeStoreId===store.id?"page":undefined} onClick={()=>handleSelect(store.id)}
          className={`flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-earth-50 ${activeStoreId===store.id?"bg-primary-50 font-medium text-primary-700":"text-earth-600"}`}>
          <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${activeStoreId===store.id?"bg-primary-500":"bg-earth-300"}`}/>
          <span className="min-w-0 flex-1 break-words">{store.name}</span>
          {activeStoreId===store.id&&<span className="shrink-0 text-primary-700" aria-label="目前店舖">✓</span>}
          {store.isDefault&&<span className="shrink-0 text-sm text-earth-500">主店</span>}
        </button>)}
        {!visibleStores.length&&<p role="status" className="px-3 py-4 text-sm text-earth-600">{availableStores.length?"找不到符合的店舖，請換個關鍵字。":"目前沒有可切換的店舖。"}</p>}
      </div>
      <div className="shrink-0 border-t border-earth-100 bg-earth-50 px-3 py-2 text-sm text-earth-600">
        <p aria-live="polite">{search.trim()?`符合 ${visibleStores.length} 間／共 ${availableStores.length} 間`:`共 ${availableStores.length} 間店舖`}</p>
        {moreBelow&&<p>向下捲動查看更多 ↓</p>}
      </div>
    </div>,document.body);

  // Inline header mode: compact dropdown
  if (inline || collapsed) {
    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={collapsed ? "切換分店" : undefined}
          title={collapsed ? currentLabel : undefined}
          onClick={() => {
            setSearch("");
            setOpen(!open);
          }}
          disabled={isPending}
          className="flex min-h-11 items-center gap-1 rounded-md px-2 py-1 text-xs text-earth-600 hover:bg-earth-100 hover:text-earth-800 disabled:opacity-50 transition-colors"
        >
          <span className="max-w-[140px] truncate font-medium">
            {collapsed ? "店" : currentLabel}
          </span>
          {isPending ? (
            <svg
              className="h-3 w-3 animate-spin text-earth-400 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className={`h-3 w-3 text-earth-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          )}
        </button>

        {menu}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative px-3 py-2">
      <button
        type="button"
        aria-expanded={open}
          aria-controls={open ? menuId : undefined}
        onClick={() => {
          setSearch("");
          setOpen(!open);
        }}
        disabled={isPending}
        className="flex min-h-11 w-full items-center justify-between rounded-lg border border-earth-200 bg-earth-50 px-2.5 py-1.5 text-left text-xs text-earth-700 hover:bg-earth-100 disabled:opacity-50"
      >
        <span className="flex items-center gap-1.5 truncate">
          <svg
            className="h-3.5 w-3.5 shrink-0 text-earth-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72"
            />
          </svg>
          <span className="truncate">{currentLabel}</span>
        </span>
        {isPending ? (
          <svg
            className="h-3 w-3 animate-spin text-earth-400"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <svg
            className={`h-3 w-3 text-earth-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        )}
      </button>

      {menu}
    </div>
  );
}
