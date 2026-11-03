"use client";
import {useState,type CSSProperties} from 'react';
type Props={selectTimes?:boolean;value:string;onChange:(event:{target:{value:string}})=>void;className?:string;style?:CSSProperties;disabled?:boolean;required?:boolean;name?:string;id?:string;step?:number;'aria-label'?:string;'aria-invalid'?:boolean;'aria-describedby'?:string};
/** Stable in-sheet picker. Existing off-grid values remain selectable and unchanged. */
export function TimeOfDayField({selectTimes=false,step=1800,value,onChange,...props}:Props){
 const [custom,setCustom]=useState(false);
 if(!selectTimes)return <input {...props} type="time" step={step} value={value} onChange={onChange}/>;
 if(custom){
  const {className,style,...attributes}=props;
  return <span className={className} style={{...style,minHeight:44,display:'inline-flex',alignItems:'center',gap:4}}><input {...attributes} type="text" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" placeholder="HH:MM" className="min-w-0 w-full bg-transparent" value={value} onChange={onChange}/><button type="button" aria-label="改用時間選單" disabled={props.disabled} className="min-h-11 shrink-0 px-1 text-sm" onClick={()=>setCustom(false)}>選單</button></span>;
 }
 const times=Array.from({length:48},(_,i)=>`${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`);
 if(value&&!times.includes(value))times.push(value);
 return <select {...props} style={{...props.style,minHeight:44,appearance:'auto'}} value={value} onChange={event=>{if(event.target.value==='__custom__')setCustom(true);else onChange(event);}}>{!value&&<option value="">請選擇時間</option>}{times.sort().map(time=><option key={time} value={time}>{time}</option>)}<option value="__custom__">自訂時間…</option></select>;
}
