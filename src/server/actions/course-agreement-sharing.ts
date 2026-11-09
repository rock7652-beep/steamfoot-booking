'use server';
import {shareAgreement} from '@/server/services/agreement-sharing';
export async function shareCourseAgreementAction(storeId:string){return shareAgreement(storeId);}
