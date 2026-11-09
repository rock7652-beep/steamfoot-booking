type StoreProfile={name:string;address:string;shopPhone:string};
const eventName="store-profile-saved";
/** Same-page confirmation only; no stored or cross-tab customer/profile cache. */
export function publishStoreProfileSaved(storeId:string,{name,address,shopPhone}:StoreProfile){
 window.dispatchEvent(new CustomEvent(eventName,{detail:{storeId,profile:{name,address,shopPhone}}}));
}
export function subscribeStoreProfileSaved(storeId:string,receive:(profile:StoreProfile)=>void){
 const listener=(event:Event)=>{
  const data=(event as CustomEvent<{storeId:string;profile:StoreProfile}>).detail;
  if(data?.storeId===storeId&&data.profile&&[data.profile.name,data.profile.address,data.profile.shopPhone].every(v=>typeof v==='string'))receive(data.profile);
 };
 window.addEventListener(eventName,listener);return()=>window.removeEventListener(eventName,listener);
}
