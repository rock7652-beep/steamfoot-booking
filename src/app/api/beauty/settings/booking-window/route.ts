import {courseBookingWindowSaveInput,bookingWindowInput,bookingWindowRevision} from '@/lib/course-booking-window-save';
import {settingsSavePOST} from '@/server/services/settings-save-route';
import {beautyManager,beautyTransaction,audit} from '@/server/beauty/access';
import {settings} from '@/server/beauty/booking';
import {parseTaipeiDateTime} from '@/lib/date-utils';
import {AppError,handleActionError} from '@/lib/errors';
export const POST=settingsSavePOST(courseBookingWindowSaveInput.extend({values:bookingWindowInput(365)}),async d=>{
 try{const a=await beautyManager('business_hours.manage',true);if(a.storeId!==d.expectedStoreId)throw new AppError('FORBIDDEN','店家已切換');if(d.values.mode==='fixed'&&!parseTaipeiDateTime(d.values.date,'00:00'))throw new AppError('VALIDATION','日期不正確');
 const data=await beautyTransaction(a,async tx=>{const current=await settings(tx,a.storeId),before={date:current.bookableUntilDate??null,days:current.bookableDays,opensAt:null};const identical=d.values.mode==='fixed'?before.date===d.values.date:before.date===null&&before.days===d.values.days;if(identical)return before;if(bookingWindowRevision(before)!==d.expectedRevision)throw new AppError('CONFLICT','預約期限已更新');const next=d.values.mode==='fixed'?{bookableUntilDate:d.values.date}:{bookableUntilDate:null,bookableDays:d.values.days};const saved=await tx.beautySetting.upsert({where:{storeId:a.storeId},create:{...current,...next,revision:1},update:{...next,revision:{increment:1}}});await audit(tx,a,'SETTINGS_BOOKING_WINDOW',JSON.stringify(next));return {date:saved.bookableUntilDate,days:saved.bookableDays,opensAt:null};});return {success:true,storeId:a.storeId,data};
 }catch(e){const r=handleActionError(e);return {success:false,error:r.success?'儲存失敗':r.error};}
});
