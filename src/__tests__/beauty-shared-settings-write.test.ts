import {beforeEach,it,expect,vi} from 'vitest';
type SaveInput={expectedStoreId:string;expectedRevision?:string|number;enabled?:boolean;values?:{mode:string;days?:number;date?:string}};
type Save=(v:SaveInput)=>Promise<unknown>;
const m=vi.hoisted(()=>({feature:vi.fn(),actor:vi.fn(),tx:vi.fn(),settings:vi.fn(),audit:vi.fn(),upsert:vi.fn(),saves:[] as Save[]}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.actor,beautyTransaction:m.tx,audit:m.audit}));
vi.mock('@/server/beauty/booking',()=>({settings:m.settings}));
vi.mock('@/server/services/settings-save-route',()=>({settingsSavePOST:(_s:unknown,save:Save)=>{m.saves.push(save);return vi.fn();}}));
import {saveBeautyOperationSwitch} from '@/server/actions/beauty-settings-patch';
import '@/app/api/beauty/settings/self-booking/route';
import '@/app/api/beauty/settings/booking-window/route';
import {bookingWindowRevision,bookingWindowInput,courseBookingWindowInput} from '@/lib/course-booking-window-save';
const current={storeId:'store',revision:4,selfBooking:true,selfCancel:true,selfReschedule:true,notifications:false,cancelDeduct:false,noShowDeduct:false,bookableUntilDate:null,bookableDays:365,leadMinutes:0,cancelLeadMinutes:240};
beforeEach(()=>{vi.clearAllMocks();m.actor.mockResolvedValue({storeId:'store',userId:'owner'});m.settings.mockResolvedValue({...current});m.tx.mockImplementation((_a,work)=>work({beautySetting:{upsert:m.upsert}}));m.upsert.mockResolvedValue({...current,revision:5,selfBooking:false,bookableDays:180});});
it('saves only the selected switch without overwriting independent settings',async()=>{expect(await saveBeautyOperationSwitch({storeId:'store',key:'selfCancel',enabled:false,previous:true})).toMatchObject({success:true});expect(m.upsert.mock.calls[0][0].update).toEqual({selfCancel:false,revision:{increment:1}});});
it('rejects unknown setting keys, cross-store and revoked access before any write',async()=>{expect(await saveBeautyOperationSwitch({storeId:'store',key:'storeId',enabled:false,previous:true})).toMatchObject({success:false});expect(await saveBeautyOperationSwitch({storeId:'other',key:'selfCancel',enabled:false,previous:true})).toMatchObject({success:false});m.actor.mockRejectedValue(new Error('無權限'));expect(await saveBeautyOperationSwitch({storeId:'store',key:'selfCancel',enabled:false,previous:true})).toMatchObject({success:false});expect(m.tx).not.toHaveBeenCalled();});
it('requires the self-booking revision and accepts an already applied retry',async()=>{expect(await m.saves[0]({expectedStoreId:'store',expectedRevision:3,enabled:false})).toMatchObject({success:false});expect(m.upsert).not.toHaveBeenCalled();expect(await m.saves[0]({expectedStoreId:'store',expectedRevision:3,enabled:true})).toMatchObject({success:true,data:{enabled:true,revision:4}});});
it('preserves the Beauty 365-day range while the existing course schema stays unchanged',()=>{expect(bookingWindowInput(365).safeParse({mode:'rolling',days:365}).success).toBe(true);expect(courseBookingWindowInput.safeParse({mode:'rolling',days:365}).success).toBe(false);});
it('uses authoritative window receipts, rejects stale changes and accepts identical retries',async()=>{const save=m.saves[1];expect(await save({expectedStoreId:'store',expectedRevision:'old',values:{mode:'rolling',days:180}})).toMatchObject({success:false});expect(m.upsert).not.toHaveBeenCalled();expect(await save({expectedStoreId:'store',expectedRevision:'old',values:{mode:'rolling',days:365}})).toMatchObject({success:true,data:{days:365}});const revision=bookingWindowRevision({date:null,days:365,opensAt:null});expect(await save({expectedStoreId:'store',expectedRevision:revision,values:{mode:'rolling',days:180}})).toMatchObject({success:true,data:{days:180}});expect(m.upsert.mock.calls[0][0].update).toEqual({bookableUntilDate:null,bookableDays:180,revision:{increment:1}});});
it('rejects a stale attempt to turn off the digital manager without changing LINE',async()=>{expect(await saveBeautyOperationSwitch({storeId:'store',key:'backendNoticesEnabled',enabled:false,previous:true})).toMatchObject({success:false});expect(m.tx).not.toHaveBeenCalled();expect(m.upsert).not.toHaveBeenCalled();});

it.each(['cancelDeduct','noShowDeduct'])('rejects retired %s switch writes',async key=>{
 expect(await saveBeautyOperationSwitch({storeId:'store',key,enabled:true,previous:false})).toMatchObject({success:false});expect(m.tx).not.toHaveBeenCalled();
});
it('restores the existing store LINE switch without modifying bell or booking preferences',async()=>{
 expect(await saveBeautyOperationSwitch({storeId:'store',key:'notifications',enabled:true,previous:false})).toMatchObject({success:true,data:{enabled:true}});
 expect(m.feature).toHaveBeenCalledWith('store','line_reminder');
 expect(m.upsert.mock.calls[0][0].update).toEqual({notifications:true,revision:{increment:1}});
});
it('rejects an unavailable LINE feature before changing the store switch',async()=>{
 m.feature.mockRejectedValueOnce(new Error('LINE unavailable'));
 expect(await saveBeautyOperationSwitch({storeId:'store',key:'notifications',enabled:true,previous:false})).toMatchObject({success:false});
 expect(m.tx).not.toHaveBeenCalled();
});
