"use client";

import dynamic from 'next/dynamic';
import {useCallback,useState} from 'react';
import {ModalPanel} from '@/components/admin/modal-panel';
import type {BeautyCollectionPanelProps} from './collection-panel';

const Draft=dynamic(async()=>{
  const at=performance.now();
  const loaded=await import('./collection-panel');
  if(typeof performance.measure==='function')performance.measure('beauty-collection.code',{start:at,end:performance.now()});
  return loaded.BeautyCollectionPanel;
},{loading:()=> <p role="status" className="p-4">正在讀取收款資料…</p>});

/** The shell and focus stack exist before the lazy code or authoritative read. */
export function BeautyCollectionDialog(props:BeautyCollectionPanelProps) {
  const [busy,setBusy]=useState(false);
  const {onGuard}=props;
  const guard=useCallback((dirty:boolean,pending:boolean)=>{setBusy(pending);onGuard(dirty,pending);},[onGuard]);
  const close=()=>{if(!busy)props.onClose();};
  return <ModalPanel open onClose={close} labelledById="beauty-collection-title" pending={busy} width={560}>
    <header className="flex items-center justify-between gap-2 border-b p-4"><h2 id="beauty-collection-title" className="font-semibold">服務收款</h2><button type="button" disabled={busy} className="min-h-11 rounded-lg border border-earth-200 px-3 disabled:opacity-50" onClick={close}>關閉</button></header>
    <Draft {...props} modal withinModal onGuard={guard}/>
  </ModalPanel>;
}
