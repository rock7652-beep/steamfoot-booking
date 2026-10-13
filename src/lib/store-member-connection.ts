/** Phone is a search key, never identity evidence. */
export function memberConnectionCommand(slug: string, phone: string): string {
  return `會員連結 ${slug} ${phone}`;
}

export function parseMemberConnectionCommand(text: string): { slug: string; phone: string } | null {
  const match = text.trim().match(/^會員連結 ([a-z0-9-]+) (09\d{8})$/);
  return match ? { slug: match[1], phone: match[2] } : null;
}

export function connectionConflict(customer: {
  mergedIntoCustomerId: string | null; userId: string | null;
  identityLinks: Array<{ userId: string }>;
}, userId: string | null): string | null {
  if (customer.mergedIntoCustomerId) return "顧客資料已合併，需重新確認";
  const owners = new Set([...(customer.userId ? [customer.userId] : []), ...customer.identityLinks.map(l => l.userId)]);
  if (owners.size && (!userId || owners.size !== 1 || !owners.has(userId))) return "顧客已屬於其他帳號，需確認身分";
  return null;
}

export const connectionResultLabels = {
  pending: "已收到電話，請門市核對本人後確認；尚未完成綁定。",
  linked: "本店會員已連結，不需再次填寫。請保持官方 LINE 未封鎖以接收通知。",
  review: "資料需要確認，請聯繫門市；原有連結未變更。",
  unavailable: "目前無法完成，請稍後再試或聯繫門市。",
} as const;
