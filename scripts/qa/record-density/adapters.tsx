import type {ReactNode} from 'react';
export function useFeaturePresentation(){return 'ENABLED';}
export function FeatureEntry({children}:{children:ReactNode}){return <>{children}</>;}
export function LabelManager(){return null;}
export async function setCustomerLabel(){return {success:false,error:'隔離預覽不寫入資料'};}
export async function readCustomerLabels(){throw new Error('隔離預覽不讀取業務資料');}

export async function getMusicSlotMatches(){throw new Error('隔離預覽不讀取可約時段');}

/** Requests are intercepted by the isolated browser test; no business endpoint exists here. */
export async function saveMonthlyAdjustment(input:unknown){return fetch('/__qa/monthly/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json());}
export async function deleteMonthlyAdjustment(input:unknown){return fetch('/__qa/monthly/delete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json());}
export async function changeAdjustmentMonthLock(){throw new Error('隔離預覽不執行月結確認');}
export async function confirmCourseMonthlySettlement(){throw new Error('隔離預覽不執行月結確認');}
export async function saveCourseSettlementSettings(){throw new Error('隔離預覽不變更權限');}
export async function payCourseProfit(){throw new Error('隔離預覽不付款');}
export async function correctCourseProfit(){throw new Error('隔離預覽不付款');}
export async function payCourseFee(){throw new Error('隔離預覽不付款');}
export async function correctCourseFee(){throw new Error('隔離預覽不付款');}
