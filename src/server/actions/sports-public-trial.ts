"use server";
import { handleActionError } from "@/lib/errors";
import { submitSportsPublicTrial } from "@/server/services/sports-public-trial";

export async function bookPublicSportsTrial(slug: string, input: unknown) {
  try { return { success: true as const, data: await submitSportsPublicTrial(slug, input) }; }
  catch (error) { return handleActionError(error); }
}
