"use client";
import {useState,useTransition,useRef,useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {saveBeautyMemberProfile,saveBeautyMemberPassword} from '@/server/actions/beauty-member';
import {useCourseDraftGuard} from '@/components/admin/use-course-draft-guard';
import {toLocalDateStr} from '@/lib/date-utils';
export function BeautyMemberProfile({customer,onClose,onStateChange,readOnly=false}:{customer:{name:string;phone:string;birthday?:string}|null;onClose:()=>void;readOnly?:boolean;onStateChange?:(s:{dirty:boolean;pending:boolean})=>void}){
 const router=useRouter(),[pending,start]=useTransition(),[dirty,setDirty]=useState(false),[message,setMessage]=useState(''),[password,setPassword]=useState(false),busy=useRef(false);
 useCourseDraftGuard(dirty,pending);
 useEffect(()=>{onStateChange?.({dirty,pending});},[dirty,pending,onStateChange]);
 return <section className="space-y-4"><button disabled={pending} onClick={()=>{if(!dirty||confirm('尚有未儲存的資料，確定返回？'))onClose();}}>‹ 返回我的</button><h2>編輯資料</h2>
 <form key={password?"password":"profile"} className="space-y-3" onChange={()=>setDirty(true)} onSubmit={e=>{e.preventDefault();if(readOnly||busy.current)return;const form=e.currentTarget,f=new FormData(form);busy.current=true;start(async()=>{try{const r=password?await saveBeautyMemberPassword({currentPassword:f.get('currentPassword'),password:f.get('password'),confirmPassword:f.get('confirmPassword')}):await saveBeautyMemberProfile({name:f.get('name'),birthday:f.get('birthday')});if(r.success){setDirty(false);setMessage('已儲存');if(password)form.reset();router.refresh();}else setMessage(r.error);}catch{setMessage('連線失敗，內容已保留，請重試。');}finally{busy.current=false;}});}}>
 <fieldset disabled={pending||readOnly} className="space-y-3">{password?<><label className="block">目前密碼<input className="block w-full" type="password" name="currentPassword" autoComplete="current-password" required maxLength={200}/></label><label className="block">新密碼<input className="block w-full" type="password" name="password" autoComplete="new-password" required minLength={8} maxLength={100}/></label><label className="block">確認新密碼<input className="block w-full" type="password" name="confirmPassword" autoComplete="new-password" required/></label></>:<><label className="block">姓名<input className="block w-full" name="name" required maxLength={100} defaultValue={customer?.name}/></label><p>手機號碼：{customer?.phone}</p><p>修改手機請聯絡店家協助。</p><label className="block">生日（選填）<input className="block w-full" name="birthday" type="date" max={toLocalDateStr()} defaultValue={customer?.birthday??''}/></label></>}<button className="primary" type="submit">{pending?'儲存中…':'儲存'}</button></fieldset></form>
 <button disabled={pending||readOnly} onClick={()=>{if(dirty&&!confirm('尚有未儲存的資料，確定切換？'))return;setPassword(!password);setDirty(false);setMessage('');}}>{password?'編輯基本資料':'修改密碼'}</button>{message&&<p role="status">{message}</p>}</section>;
}
