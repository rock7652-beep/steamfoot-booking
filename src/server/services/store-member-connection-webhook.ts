import { prisma } from "@/lib/db";
import { replyMessage } from "@/lib/line";
import { captureStoreMemberConnection, connectionReplyText } from "./store-member-connection";
import { parseMemberConnectionCommand } from "@/lib/store-member-connection";

/** Caller has verified HMAC. Explicit slug must belong to this physical OA. */
export async function handleMemberConnectionWebhook(input: {
  destination: string; storeIds: string[];
  event: { type: string; timestamp?: number; source?: { userId?: string }; message?: { type?: string; text?: string }; replyToken?: string };
}): Promise<boolean> {
  const event = input.event;
  if (event.type !== "message" || event.message?.type !== "text" || !event.source?.userId) return false;
  const command = parseMemberConnectionCommand(event.message.text ?? "");
  if (!command) return false;
  const store = await prisma.store.findFirst({ where: { id: { in: input.storeIds }, slug: command.slug }, select: { id: true } });
  if (!store) return true;
  const result = await captureStoreMemberConnection({ storeId: store.id, destination: input.destination, lineUserId: event.source.userId, phone: command.phone, timestamp: event.timestamp ?? 0 });
  if (event.replyToken) await replyMessage(store.id, event.replyToken, [{ type: "text", text: await connectionReplyText(result, store.id, event.source.userId) }]);
  return true;
}
