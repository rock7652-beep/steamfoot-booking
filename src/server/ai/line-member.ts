import "server-only";
import type { AiLineSubject } from "./line-webhook";

type Account = { id: string; role: string; status: string };
type Membership = { userId: string; storeId: string; customerId: string };
/** LINE HMAC proves the sender, not membership. No phone/email/name fallback or writes. */
export async function resolveAiLineMember(storeId: string, provider: string, senderId: string, ports: {
  account(provider: string, senderId: string): Promise<Account | null>;
  membership(userId: string, storeId: string): Promise<Membership | null>;
}): Promise<AiLineSubject> {
  if (!storeId || storeId === "__all__" || !/^line-provider:\d+$/.test(provider) || !/^U[a-f0-9]{32}$/.test(senderId)) throw new Error("AI_LINE_IDENTITY_REQUIRED");
  const user = await ports.account(provider, senderId);
  if (!user) return { kind: "GUEST" };
  if (user.status !== "ACTIVE" || user.role !== "CUSTOMER") throw new Error("AI_LINE_MEMBER_INACTIVE");
  const member = await ports.membership(user.id, storeId);
  if (!member) return { kind: "GUEST" };
  if (member.storeId !== storeId || member.userId !== user.id || !member.customerId) throw new Error("AI_LINE_MEMBER_CONFLICT");
  return { kind: "MEMBER", userId: user.id, customerId: member.customerId };
}
