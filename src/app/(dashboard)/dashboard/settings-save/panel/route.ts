import {settingsSavePOST} from '@/server/services/settings-save-route';
import {z} from 'zod';
import {requireWritablePermission} from '@/lib/permissions';
import {resolveWriteStoreId} from '@/lib/store';
import {updateReferralShareTemplate} from '@/server/actions/referral-share-template';
import {saveDigitalButlerFlowAction,createDigitalButlerFlowAction,publishDigitalButlerFlowAction,setDigitalButlerFlowEnabledAction} from '../../settings/digital-butler/actions';
import {revalidateTag} from 'next/cache';
import {saveCoursePlanReminderSetting} from '@/server/actions/course-plan-reminders';
import {coursePlanReminderSchema} from '@/lib/course-plan-reminders';
import {CACHE_TAGS} from '@/lib/cache-tags';
import {saveTrialCareSettings} from '@/server/actions/trial-care';
import {trialCareRulesSchema} from '@/lib/trial-care';
const body=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('BUTLER_CREATE'),storeId:z.string().min(1),input:z.object({name:z.string(),definition:z.unknown()})}),
 z.object({kind:z.literal('BUTLER_PUBLISH'),storeId:z.string().min(1),input:z.object({flowId:z.string().min(1)})}),
 z.object({kind:z.literal('BUTLER_ENABLED'),storeId:z.string().min(1),input:z.object({flowId:z.string().min(1),enabled:z.boolean()})}),
 z.object({kind:z.literal('TRIAL_CARE'),storeId:z.string().min(1),input:z.object({enabled:z.boolean(),rules:trialCareRulesSchema})}),
 z.object({kind:z.literal('PLAN_REMINDER'),storeId:z.string().min(1),input:coursePlanReminderSchema}),
 z.object({kind:z.literal('REFERRAL'),storeId:z.string().min(1),input:z.object({referralShareTemplate:z.string().nullable()})}),
 z.object({kind:z.literal('BUTLER_DRAFT'),storeId:z.string().min(1),input:z.object({flowId:z.string().min(1),name:z.string(),definition:z.unknown()})}),
]);
/** JSON receipts avoid Server Action route re-rendering. Existing actions own all write checks. */
export const POST=settingsSavePOST(body,async data=>{
  const user=await requireWritablePermission(['PLAN_REMINDER','TRIAL_CARE'].includes(data.kind)?'business_hours.manage':'plans.edit');
  const storeId=await resolveWriteStoreId(user);
  if(storeId!==data.storeId)return {success:false,error:'門市已切換，修改未送出。'};
  if(data.kind==='BUTLER_PUBLISH'){const result=await publishDigitalButlerFlowAction(data.input.flowId,true);return result.success?{success:true,storeId,data:result.publishedVersion}:{...result,storeId};}
  if(data.kind==='BUTLER_CREATE')return {...await createDigitalButlerFlowAction({...data.input,definition:data.input.definition},true),storeId};
  if(data.kind==='BUTLER_ENABLED')return {...await setDigitalButlerFlowEnabledAction(data.input.flowId,data.input.enabled,true),storeId};
  const result=data.kind==='TRIAL_CARE'?await saveTrialCareSettings({...data.input,storeId},true):data.kind==='PLAN_REMINDER'?await saveCoursePlanReminderSetting(data.input,true):data.kind==='REFERRAL'?await updateReferralShareTemplate(data.input,true):await saveDigitalButlerFlowAction({...data.input,definition:data.input.definition},true);
  if(result.success&&data.kind==='REFERRAL')revalidateTag(CACHE_TAGS.shopConfig,{expire:0});
  return {...result,storeId};
},200000);
