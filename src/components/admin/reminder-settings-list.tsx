"use client";

import {createContext,useCallback,useContext,useEffect,useId,useMemo,useRef,useState,type ReactNode,type MouseEvent} from 'react';
import {useRouter} from 'next/navigation';
import {SettingsPanelContext,type SettingsPanelState} from './settings-panel-context';
import styles from './reminder-settings-list.module.css';

const ReminderRowsContext=createContext<string|undefined>(undefined);

/** One disclosure per mounted center. Closing a row never unmounts its draft. */
export function ReminderSettingsScope({children}:{children:ReactNode}){
 const id=useId(),router=useRouter(),parent=useContext(SettingsPanelContext);
 const root=useRef<HTMLDivElement>(null);
 const states=useRef(new Map<string,SettingsPanelState>());
 const [notice,setNotice]=useState('');
 const parentReport=parent?.report,parentNavigate=parent?.navigate;
 const report=useCallback((key:string,state:SettingsPanelState|null)=>{
  if(state)states.current.set(key,state);else states.current.delete(key);
  parentReport?.(`${id}:${key}`,state);
 },[id,parentReport]);
 const navigate=useCallback((href:string)=>{
  if(parentNavigate){parentNavigate(href);return;}
  if([...states.current.values()].some(s=>s.pending)){setNotice('設定正在儲存，請稍候再切換。');return;}
  if([...states.current.values()].some(s=>s.dirty)&&!window.confirm('有尚未儲存的變更，確定離開並捨棄嗎？'))return;
  router.push(href);
 },[parentNavigate,router]);
 useEffect(()=>{
  const current=states.current;
  const before=(event:BeforeUnloadEvent)=>{if([...current.values()].some(s=>s.dirty||s.pending)){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',before);
  return()=>{window.removeEventListener('beforeunload',before);for(const key of current.keys())parentReport?.(`${id}:${key}`,null);};
 },[id,parentReport]);
 useEffect(()=>{const element=root.current;if(!element)return;const toggle=(event:Event)=>{const target=event.target;if(target instanceof HTMLDetailsElement&&target.open&&target.hasAttribute('data-reminder-row'))element.querySelectorAll<HTMLDetailsElement>('details[data-reminder-row][open]').forEach(other=>{if(other!==target)other.open=false;});};element.addEventListener('toggle',toggle,true);return()=>element.removeEventListener('toggle',toggle,true);},[]);
 const context=useMemo(()=>({report,navigate,registerReader:parent?.registerReader}),[report,navigate,parent?.registerReader]);
 return <ReminderRowsContext.Provider value={`reminder-rows-${id}`}><SettingsPanelContext.Provider value={context}><div ref={root} className="min-w-0">{notice&&<p role="status" className="mb-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</p>}{children}</div></SettingsPanelContext.Provider></ReminderRowsContext.Provider>;
}

export function ReminderSettingsList({children,label}:{children:ReactNode;label?:string}){
 return <div className={styles.list} aria-label={label}>{children}</div>;
}

export function closeReminderRow(event:MouseEvent<HTMLButtonElement>){
 const row=event.currentTarget.closest<HTMLDetailsElement>('details[data-reminder-row]');
 if(row){row.open=false;row.querySelector('summary')?.focus();}
}

export function ReminderSettingRow({title,description,control,children,action='預覽／修改',dirty=false,pending=false,error,resetToken}:{
 title:string;description?:ReactNode;control?:ReactNode;children?:ReactNode;action?:string;dirty?:boolean;pending?:boolean;error?:ReactNode;resetToken?:unknown;
}){
 const name=useContext(ReminderRowsContext),row=useRef<HTMLDetailsElement>(null),previous=useRef(resetToken);
 useEffect(()=>{if(previous.current!==resetToken){previous.current=resetToken;if(row.current)row.current.open=false;}},[resetToken]);
 const heading=<><div className={styles.heading}><span className="font-semibold text-earth-900">{title}</span>{description&&<div className="mt-1 text-sm leading-relaxed text-earth-500">{description}</div>}{dirty&&<span role="status" className="mt-1 block text-sm text-amber-800">未儲存</span>}{error&&<div role="alert" className="mt-1 break-words text-sm text-red-700">{error}</div>}</div><div className={styles.control} onClick={e=>e.stopPropagation()}>{control}</div></>;
 if(!children)return <div data-reminder-row className={styles.row}><div className={styles.summary}>{heading}</div></div>;
 return <details ref={row} name={name} data-reminder-row className={styles.row} aria-label={title}>
  <summary className={styles.summary}>{heading}<span className={styles.action}>{pending?'儲存中…':action}<span aria-hidden="true" className={styles.chevron}>⌄</span></span></summary>
  <div className={styles.body}>{children}</div>
 </details>;
}
