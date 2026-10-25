import type { LineMessage } from "./line";

export type StoreLineWelcome = {
  name: string; slug: string;
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

function contactLines(store: StoreLineWelcome) {
  const contact = store.shopConfig, map = mapLink(contact);
  return [
    ...(contact?.shopPhone?.trim() ? [`聯絡電話：${contact.shopPhone.trim()}`] : []),
    ...(contact?.address?.trim() ? [`地址：${contact.address.trim()}`] : []),
    ...(map ? [`Google 地圖導航：${map}`] : []),
  ];
}

/** Shared presentation only. This never creates a member or claims a binding succeeded. */
export function buildStoreLineWelcome(stores: StoreLineWelcome[], baseUrl: string): LineMessage[] {
  if (!stores.length) return [];
  const origin = new URL(baseUrl);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password) throw Error("Invalid store entry origin");
  const guidance = "首次連結，請輸入在本店預約或登記時填寫的手機號碼，由門市核對一次。已完成本店連結者可直接沿用。";
  if (stores.length === 1) {
    const store = stores[0];
    const text = [`歡迎加入${store.name}！`, "", guidance, "", ...contactLines(store)].join("\n");
    return [{ type: "text", text: text.length <= 4900 ? text : `歡迎加入本店官方 LINE！\n${guidance}` }];
  }
  const text = ["歡迎加入官方 LINE！", "此帳號服務多家門市，請選擇本次預約的門市，再填寫手機並送出 LINE 訊息。", "",
    ...stores.flatMap(store => {
      if (!/^[a-z0-9-]+$/.test(store.slug)) throw Error("Invalid store entry slug");
      const url = new URL("/member-connect", origin); url.searchParams.set("store", store.slug);
      return [store.name, url.href, ...contactLines(store), ""];
    }), "已完成該門市連結者可直接沿用；首次由門市核對一次。"].join("\n");
  return [{ type: "text", text: text.length <= 4900 ? text : "歡迎加入官方 LINE！此帳號服務多家門市，請使用您預約門市的專屬連結，填寫手機並完成門市核對。已完成連結者可直接沿用。" }];
}
