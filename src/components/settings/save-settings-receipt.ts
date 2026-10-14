/** Local panel writes keep server receipts separate from the current RSC page. */
export async function saveSettingsReceipt<T>(kind:string,storeId:string,input:unknown):Promise<{success:true;data:T}|{success:false;error:string}>{
 const started=performance.now();
 try{
  const prefix=window.location.pathname.split('/dashboard')[0];
  const response=await fetch(`${prefix}/dashboard/settings-save/panel`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({kind,storeId,input})});
  const result=await response.json();
  if(result.success!==true)return {success:false,error:result.error??'儲存失敗，輸入已保留。'};
  if(result.storeId!==storeId)throw new Error('scope changed');
  console.info('[SETTINGS_SAVE_CLIENT_PERF]',{responseMs:Math.round(performance.now()-started)});
  return {success:true,data:result.data};
 }catch{return {success:false,error:'尚未確認儲存結果，請重新開啟核對；輸入已保留。'};}
}
