"use server";
import {settingsSaveUncertain} from "@/server/services/settings-save-error";
import {z} from 'zod';
import {prisma} from '@/lib/db';
import {beautyManager} from '@/server/beauty/access';
import {AppError,handleActionError} from '@/lib/errors';
import {courseStaffSaveInput} from '@/lib/course-staff-save';
import {savedStaffPerson} from '@/lib/staff-settings-save';
import {BEAUTY_PERMISSIONS} from '@/lib/beauty/permissions';
import {nativeBeautyAccount} from '@/lib/beauty/native-staff';
import {saveStaffConfirmed} from './staff';

/** Original account-management transaction, with a Beauty-scoped input adapter. */
export async function saveBeautyNativeAccount(input:unknown){let committed=false;try{
 const a=await beautyManager('staff.manage',true),d=courseStaffSaveInput.parse(input);if(d.expectedStoreId!==a.storeId)throw new AppError('FORBIDDEN','門市已切換，請重新開啟');
 const v=z.object({id:z.string().optional(),kind:z.literal('manager'),name:z.string(),phone:z.string(),email:z.string(),password:z.string().optional(),active:z.boolean(),backendRole:z.enum(['OWNER','MANAGER','STAFF']).optional(),permissions:z.array(z.string()).default([]),birthday:z.string(),emergencyContactName:z.string(),emergencyContactPhone:z.string(),emergencyContactRelation:z.string()}).parse(d.values);
 if(v.permissions.some(p=>!BEAUTY_PERMISSIONS.includes(p as typeof BEAUTY_PERMISSIONS[number])))throw new AppError('FORBIDDEN','只能設定美業模組的管理權限');
 const target=v.id?await prisma.staff.findFirst({where:{id:v.id,storeId:a.storeId},select:{user:{select:{role:true}}}}):null;if(v.id&&!target)throw new AppError('FORBIDDEN','找不到本店人員');
 const role=v.backendRole??target?.user.role??'STAFF';
 const result=await saveStaffConfirmed({id:v.id,expectedStoreId:d.expectedStoreId,expectedVersion:d.expectedVersion,requestKey:d.requestKey,values:{displayName:v.name,...(!v.id?{name:v.name}:{}),phone:v.phone,email:v.email,password:v.password,status:v.active?'ACTIVE':'INACTIVE',...(v.backendRole?{role:v.backendRole}:{}),...(!['OWNER','ADMIN'].includes(role)?{permissions:Object.fromEntries(BEAUTY_PERMISSIONS.map(code=>[code,v.permissions.includes(code)]))}:{}),birthday:v.birthday,emergencyContactName:v.emergencyContactName,emergencyContactPhone:v.emergencyContactPhone,emergencyContactRelation:v.emergencyContactRelation}});
 if(!result.success)return result;
 committed=true;const confirmed=z.object({storeId:z.literal(a.storeId),data:savedStaffPerson,syncWarning:z.boolean().optional()}).parse(result);
 return {success:true as const,storeId:a.storeId,syncWarning:!!confirmed.syncWarning,data:{rows:[nativeBeautyAccount(confirmed.data)]}};
}catch(error){const result=handleActionError(error);return {success:false as const,error:result.success?'儲存失敗':result.error,uncertain:committed||settingsSaveUncertain(error)};}}
