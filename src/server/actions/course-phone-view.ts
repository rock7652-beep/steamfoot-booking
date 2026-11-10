"use server";
import { handleActionError } from "@/lib/errors";
import { approveCoursePhoneView, revokeCoursePhoneView } from "@/server/services/course-phone-view";
import { approveCoursePhoneLogin, readCoursePhoneConnection } from "@/server/services/course-phone-login";

export async function loadCoursePhoneConnection(customerId: string) {
  try { return { success: true as const, data: await readCoursePhoneConnection(customerId) }; }
  catch (error) { return handleActionError(error); }
}
export async function confirmCoursePhoneLogin(input: { requestId: string; customerId: string; verificationCode: string }) {
  try { await approveCoursePhoneLogin(input); return { success: true as const }; }
  catch (error) { return handleActionError(error); }
}
export async function confirmCoursePhoneView(customerId: string) {
  try { await approveCoursePhoneView(customerId); return { success: true as const }; }
  catch (error) { return handleActionError(error); }
}
export async function removeCoursePhoneView(grantId: string) {
  try { await revokeCoursePhoneView(grantId); return { success: true as const }; }
  catch (error) { return handleActionError(error); }
}
