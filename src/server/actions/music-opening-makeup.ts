"use server";
import { revalidatePath } from "next/cache";
import { handleActionError } from "@/lib/errors";
import { courseManager } from "@/server/services/course-access";
import { changeOpeningMakeup, openingMakeupCommandSchema } from "@/server/services/music-opening-makeup";

export async function updateOpeningMakeup(input: unknown) {
  try {
    const command = openingMakeupCommandSchema.parse(input);
    const { user, storeId } = await courseManager(command.action === "RESERVE" ? "booking.create" : "booking.update");
    const data = await changeOpeningMakeup({ storeId, userId: user.id, name: user.name ?? "" }, command);
    revalidatePath("/dashboard/courses/opening-makeups");
    revalidatePath("/dashboard/courses");
    return { success: true as const, data };
  } catch (error) { return handleActionError(error); }
}
