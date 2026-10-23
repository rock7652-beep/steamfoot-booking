import {BEAUTY_PERMISSIONS} from './permissions';
import {z} from 'zod';
import {savedCoursePerson} from '@/lib/course-staff-save';
import {technicianInput} from './contracts';
export const nativeBeautyStaffRow=savedCoursePerson.omit({updatedAt:true}).extend({updatedAt:z.string().optional(),revision:z.number().int(),gender:z.enum(['FEMALE','MALE'])});
export const nativeBeautyStaffReceipt=z.object({rows:z.array(nativeBeautyStaffRow)});
export const beautyWorkPermissions=[{permission:'teacher.booking.complete',label:'替顧客完成服務'},{permission:'teacher.booking.leave',label:'替顧客取消預約'},{permission:'teacher.booking.reschedule',label:'替顧客改期'},{permission:'teacher.income.read.self',label:'查看自己的收入'}];
export const beautyWorkGrants:Record<string,string>={'teacher.booking.complete':'complete','teacher.booking.leave':'cancel','teacher.booking.reschedule':'reschedule','teacher.income.read.self':'income'};
export const savedBeautyTechnician=technicianInput.extend({id:z.string(),revision:z.number().int()});
export function nativeBeautyStaff(input:unknown,customerId='',assignments:z.infer<typeof nativeBeautyStaffRow>['assignments']=[]){
 const t=savedBeautyTechnician.parse(input);
 return nativeBeautyStaffRow.parse({id:t.id,revision:t.revision,gender:t.gender,name:t.name,kind:'coach',role:'CUSTOMER',canEdit:true,linkedStaffId:'',linkedStaffName:'',financeTeacherIds:null,coachLoginReady:!!t.userId,coachEnabled:true,defaultClassFee:'',qualificationIds:t.serviceIds,qualificationsConfirmed:true,birthday:t.birthday??'',emergencyContactRelation:t.emergencyContactRelation??'',emergencyContactName:t.emergencyContactName??'',emergencyContactPhone:t.emergencyContactPhone??'',assignments,email:'',contactEmail:t.contactEmail??'',notificationsEnabled:false,phone:t.phone??'',active:t.active,memberEnabled:true,permissions:beautyWorkPermissions.filter(p=>t.grants.includes(beautyWorkGrants[p.permission] as typeof t.grants[number])).map(p=>p.permission),customerId});
}

/** Adapt a shared backend account receipt; never creates a service-work identity. */
export function nativeBeautyAccount(input:import('zod').infer<typeof import('@/lib/staff-settings-save').savedStaffPerson>){
 return savedCoursePerson.parse({id:input.id,name:input.displayName,kind:'manager',role:input.role,canEdit:input.canEdit,linkedStaffId:'',linkedStaffName:'',financeTeacherIds:null,coachLoginReady:false,coachEnabled:false,defaultClassFee:'',qualificationIds:[],qualificationsConfirmed:false,updatedAt:input.updatedAt,birthday:input.birthday??'',emergencyContactRelation:input.emergencyContactRelation??'',emergencyContactName:input.emergencyContactName??'',emergencyContactPhone:input.emergencyContactPhone??'',assignments:[],email:input.email==='尚未設定'?'':input.email,contactEmail:'',notificationsEnabled:false,phone:input.phone??'',active:input.status==='ACTIVE',memberEnabled:true,permissions:input.permissions.filter(p=>BEAUTY_PERMISSIONS.includes(p as typeof BEAUTY_PERMISSIONS[number])),customerId:''});
}
