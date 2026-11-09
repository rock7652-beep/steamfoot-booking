import type { LineMessage } from "./line";

export type StoreLineWelcome = {
  name: string; slug: string;
  bookingHref?: string | null;
  shopConfig?: { shopPhone: string | null; address: string | null; mapUrl: string | null } | null;
};

function mapLink(config: StoreLineWelcome["shopConfig"]) {
  try {
    const url = new URL(config?.mapUrl ?? "");
    if (url.protocol === "https:" && !url.username && !url.password &&
      (url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl" && url.pathname.startsWith("/maps") ||
        /(^|\.)google\.(com|com\.tw)$/.test(url.hostname) && (url.pathname.startsWith("/maps") || url.hostname.startsWith("maps.")))) return url.href;
  } catch { /* Use this store's address when its configured map is absent. */ }
  return config?.address?.trim() ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(config.address.trim())}` : null;
}

function bookingLink(store: StoreLineWelcome) {
  try {
    const url = new URL(store.bookingHref ?? "");
    if (url.protocol === "https:" && url.hostname === "liff.line.me" && !url.username && !url.password && !url.port) return url.href;
  } catch { /* Missing configuration must never borrow another store's link. */ }
  return null;
}

function contactLines(store: StoreLineWelcome) {
  const contact = store.shopConfig, map = mapLink(contact);
  return [
    ...(contact?.shopPhone?.trim() ? [`聯絡電話：${contact.shopPhone.trim()}`] : []),
    ...(contact?.address?.trim() ? [`地址：${contact.address.trim()}`] : []),
    ...(map ? [`Google 地圖導航：${map}`] : []),
  ];
}

/** Shared presentation only. This never creates a member or claims a binding succeeded. */
export function buildStoreLineWelcome(stores: StoreLineWelcome[]): LineMessage[] {
  if (!stores.length) return [];
  const guidance = "建議先驗證 LINE 身分再預約，電話只需在表單填一次。已完成本店連結者可直接沿用；既有資料有衝突時，由門市協助核對。";
  if (stores.length === 1) {
    const store = stores[0];
    const url = bookingLink(store);
    const text = [`歡迎加入${store.name}！`, "", guidance, url ?? "本店 LINE 預約入口尚未設定，請聯絡門市。", "", ...contactLines(store), "", "若已有預約但尚未連結，也可輸入預約手機號碼，請門市協助核對。"].join("\n");
    return [{ type: "text", text: text.length <= 4900 ? text : `歡迎加入本店官方 LINE！\n${guidance}` }];
  }
  const text = ["歡迎加入官方 LINE！", "此帳號服務多家門市，請選擇本次預約的門市，驗證 LINE 身分後進入預約。", "",
    ...stores.flatMap(store => {
      if (!/^[a-z0-9-]+$/.test(store.slug)) throw Error("Invalid store entry slug");
      const url = bookingLink(store);
      return [store.name, url ?? "本店 LINE 預約入口尚未設定，請聯絡門市。", ...contactLines(store), ""];
    }), "已完成該門市連結者可直接沿用；既有資料有衝突時，由門市協助核對。"].join("\n");
  return [{ type: "text", text: text.length <= 4900 ? text : "歡迎加入官方 LINE！此帳號服務多家門市，請使用您預約門市的專屬連結，填寫手機並完成門市核對。已完成連結者可直接沿用。" }];
}
