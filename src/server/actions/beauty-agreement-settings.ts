'use server';
import {ZodError} from 'zod';
import {AppError} from '@/lib/app-error';
import {saveCourseAgreementDraft,publishCourseAgreement,pauseCourseAgreement} from '@/server/services/course-agreement-settings';
import {shareAgreement} from '@/server/services/agreement-sharing';
function message(error:unknown){
 if(error instanceof ZodError)return error.issues[0]?.message??'請確認填寫內容';
 if(error instanceof AppError)return error.message;
 if(error instanceof Error&&error.message.startsWith('請'))return error.message;
 return '暫時無法確認儲存結果；輸入已保留，請重試相同操作。';
}
export async function saveBeautyAgreementAction(input:unknown){try{return{success:true as const,data:await saveCourseAgreementDraft(input,'BEAUTY')};}catch(e){return{success:false as const,error:message(e)};}}
export async function publishBeautyAgreementAction(input:unknown){try{return{success:true as const,data:await publishCourseAgreement(input,'BEAUTY')};}catch(e){return{success:false as const,error:message(e)};}}
export async function pauseBeautyAgreementAction(input:unknown){try{return{success:true as const,data:await pauseCourseAgreement(input,'BEAUTY')};}catch(e){return{success:false as const,error:message(e)};}}
export async function shareBeautyAgreementAction(storeId:string){return shareAgreement(storeId,'BEAUTY');}
