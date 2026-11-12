"use client";
import {useState} from 'react';
/** Shared defaults: the two new modes; HOUR is visible only on an existing agreement. */
export function CourseCompensationFields({prefix,initial}:{prefix:string;initial?:{mode:'SHARE'|'CLASS'|'HOUR';value:number}|null}){
 const [mode,setMode]=useState(initial?.mode??'SHARE');
 const field='min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2';
 return <><label>計酬方式<select aria-label="預設計酬方式" className={field} name={`${prefix}Mode`} value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="SHARE">比例拆帳（%）</option><option value="CLASS">固定費用（元／次）</option>{initial?.mode==='HOUR'&&<option value="HOUR">舊約定：每小時</option>}</select></label><label>{mode==='SHARE'?'比例拆帳（%）':mode==='CLASS'?'固定費用（元／次）':'舊約定（元／小時）'}<input aria-label="預設計酬數值" className={field} name={`${prefix}Value`} type="number" min={0} max={mode==='SHARE'?100:1000000} step={mode==='CLASS'?1:0.01} required defaultValue={initial?.value??60}/></label></>;
}
