import {selfBookingSaveInput} from '@/lib/course-self-booking-save';
import {settingsSavePOST} from '@/server/services/settings-save-route';
import {beautyManager,beautyTransaction,audit} from '@/server/beauty/access';
import {settings} from '@/server/beauty/booking';
import {AppError,handleActionError} from '@/lib/errors';
export const POST=settingsSavePOST(selfBookingSaveInput,async d=>{
 try{const a=await beautyManager('business_hours.manage',true);if(a.storeId!==d.expectedStoreId)throw new AppError('FORBIDDEN','店家已切換');
 const data=await beautyTransaction(a,async tx=>{const current=await settings(tx,a.storeId);if(current.revision!==d.expectedRevision&&current.selfBooking!==d.enabled)throw new AppError('CONFLICT','設定已更新');if(current.selfBooking===d.enabled)return {enabled:current.selfBooking,revision:current.revision};const saved=await tx.beautySetting.upsert({where:{storeId:a.storeId},create:{...current,selfBooking:d.enabled,revision:1},update:{selfBooking:d.enabled,revision:{increment:1}}});await audit(tx,a,'SETTINGS_SELF_BOOKING',JSON.stringify({enabled:d.enabled}));return {enabled:saved.selfBooking,revision:saved.revision};});return {success:true,storeId:a.storeId,data};
 }catch(e){const r=handleActionError(e);return {success:false,error:r.success?'儲存失敗':r.error};}
});
