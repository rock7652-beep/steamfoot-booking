export type ReferralShareTemplateCategory =
  | "FEATURED"
  | "INDUSTRY"
  | "OCCASION"
  | "SEASONAL";

export interface OfficialReferralShareTemplate {
  id: string;
  title: string;
  description: string;
  category: ReferralShareTemplateCategory;
  industry?: string;
  badge?: string;
  content: string;
}

const lines = (...items: string[]) => items.join("\n");

export const OFFICIAL_REFERRAL_SHARE_TEMPLATES: readonly OfficialReferralShareTemplate[] = [
  {
    id: "featured-genuine-review",
    title: "真實心得版",
    description: "自然分享體驗感受，適合多數服務業",
    category: "FEATURED",
    badge: "官方精選",
    content: lines("最近去「{storeName}」體驗了一下", "整體感受很舒服，也很推薦 😊", "", "有興趣可以先看看👇", "{url}"),
  },
  {
    id: "featured-friend-recommendation",
    title: "推薦朋友版",
    description: "像傳訊息給朋友一樣簡單自然",
    category: "FEATURED",
    badge: "官方精選",
    content: lines("想到你最近也很忙", "我剛去「{storeName}」放鬆了一下，覺得很不錯", "", "分享給你參考👇", "{url}"),
  },
  {
    id: "featured-first-visit",
    title: "第一次體驗版",
    description: "降低新客第一次嘗試的心理門檻",
    category: "FEATURED",
    badge: "新客推薦",
    content: lines("第一次去「{storeName}」體驗", "過程很輕鬆，不會有壓力 🙌", "", "想試試看的話可以先了解👇", "{url}"),
  },
  {
    id: "industry-steamfoot",
    title: "蒸足／放鬆",
    description: "適合蒸足、足浴與溫熱放鬆服務",
    category: "INDUSTRY",
    industry: "蒸足",
    content: lines("我最近去「{storeName}」放鬆了一下", "整個人暖暖的，晚上也睡得特別好 😊", "", "最近有點累的話，可以去看看👇", "{url}"),
  },
  {
    id: "industry-beauty",
    title: "美容／美甲",
    description: "適合美容、美甲、美睫與皮膚管理",
    category: "INDUSTRY",
    industry: "美容",
    content: lines("最近在「{storeName}」做了一次保養", "環境舒服，完成後整個人都更有精神 ✨", "", "想找時間好好照顧自己，可以看看👇", "{url}"),
  },
  {
    id: "industry-fitness",
    title: "健身／運動",
    description: "適合健身教練、瑜珈與運動教室",
    category: "INDUSTRY",
    industry: "運動",
    content: lines("最近在「{storeName}」開始運動", "教練很有耐心，過程也不會讓人有壓力 💪", "", "想動一動、找回精神，可以先看看👇", "{url}"),
  },
  {
    id: "industry-massage",
    title: "按摩／療癒",
    description: "適合按摩、SPA 與身心療癒服務",
    category: "INDUSTRY",
    industry: "療癒",
    content: lines("最近去「{storeName}」放鬆", "做完整個肩頸輕鬆很多，氣氛也很舒服 🌿", "", "最近身體有點緊繃的話，可以看看👇", "{url}"),
  },
  {
    id: "industry-course",
    title: "課程／教室",
    description: "適合音樂、語言與各類體驗課程",
    category: "INDUSTRY",
    industry: "教學",
    content: lines("最近在「{storeName}」體驗了一堂課", "老師講得很清楚，第一次參加也不會有壓力 🙌", "", "正在找適合自己的課程，可以先看看👇", "{url}"),
  },
  {
    id: "industry-hair",
    title: "美髮／造型",
    description: "適合髮廊、頭皮護理與造型服務",
    category: "INDUSTRY",
    industry: "美髮",
    content: lines("最近去「{storeName}」整理頭髮", "完成後整個人都清爽很多，服務也很細心 ✨", "", "最近想換個感覺可以看看👇", "{url}"),
  },
  {
    id: "industry-cafe",
    title: "咖啡／甜點",
    description: "適合咖啡館、甜點店與輕食空間",
    category: "INDUSTRY",
    industry: "餐飲",
    content: lines("最近發現一間很舒服的「{storeName}」", "環境放鬆，東西也很好吃 ☕", "", "有空可以去坐坐👇", "{url}"),
  },
  {
    id: "occasion-bring-friend",
    title: "帶朋友一起",
    description: "鼓勵顧客邀請朋友共同體驗",
    category: "OCCASION",
    content: lines("下次想一起去「{storeName}」放鬆嗎？", "我上次體驗覺得很不錯 😊", "", "先把資訊傳給你👇", "{url}"),
  },
  {
    id: "occasion-opening",
    title: "開幕活動",
    description: "適合新店開幕與新據點曝光",
    category: "OCCASION",
    badge: "活動",
    content: lines("最近發現新開的「{storeName}」", "環境很舒服，現在也很適合去體驗 🎉", "", "活動資訊在這裡👇", "{url}"),
  },
  {
    id: "occasion-anniversary",
    title: "週年慶",
    description: "適合週年活動與會員回饋",
    category: "OCCASION",
    badge: "活動",
    content: lines("「{storeName}」週年活動開始了 🎉", "剛好可以安排時間去放鬆一下", "", "活動內容可以看這裡👇", "{url}"),
  },
  {
    id: "occasion-member-day",
    title: "會員日",
    description: "適合每月固定會員日或限定活動",
    category: "OCCASION",
    badge: "活動",
    content: lines("「{storeName}」最近有會員活動", "覺得很適合你，所以先分享給你 😊", "", "可以從這裡看看👇", "{url}"),
  },
  {
    id: "season-summer",
    title: "夏日放鬆",
    description: "炎熱季節的輕鬆分享文案",
    category: "SEASONAL",
    badge: "季節",
    content: lines("最近天氣好熱", "去「{storeName}」放鬆一下，整個人舒服很多 🌿", "", "你也可以去看看👇", "{url}"),
  },
  {
    id: "season-fathers-day",
    title: "父親節",
    description: "邀請爸爸或家人一起放鬆",
    category: "SEASONAL",
    badge: "節慶",
    content: lines("父親節想帶爸爸去放鬆一下", "看到「{storeName}」覺得很適合 😊", "", "先把資訊分享給你👇", "{url}"),
  },
  {
    id: "season-mid-autumn",
    title: "中秋團聚",
    description: "適合中秋節與家人團聚情境",
    category: "SEASONAL",
    badge: "節慶",
    content: lines("中秋連假想安排一個放鬆行程", "「{storeName}」看起來很不錯 🌕", "", "一起看看👇", "{url}"),
  },
  {
    id: "season-christmas",
    title: "聖誕分享",
    description: "溫暖、輕鬆的聖誕節推薦",
    category: "SEASONAL",
    badge: "節慶",
    content: lines("聖誕節想安排一點療癒行程 🎄", "最近去「{storeName}」覺得很舒服", "", "分享給你看看👇", "{url}"),
  },
  {
    id: "season-new-year",
    title: "新年新開始",
    description: "適合新年、開工與重新整理狀態",
    category: "SEASONAL",
    badge: "節慶",
    content: lines("新的一年想好好照顧自己", "最近在「{storeName}」找到很舒服的體驗 ✨", "", "你也可以先看看👇", "{url}"),
  },
  {
    id: "season-mothers-day",
    title: "母親節",
    description: "邀請媽媽享受一段專屬放鬆時間",
    category: "SEASONAL",
    badge: "節慶",
    content: lines("母親節想帶媽媽去放鬆一下", "「{storeName}」感覺很適合一起去 💛", "", "先看看資訊👇", "{url}"),
  },
] as const;

export const REFERRAL_SHARE_TEMPLATE_CATEGORIES = [
  { key: "ALL", label: "全部" },
  { key: "FEATURED", label: "官方精選" },
  { key: "INDUSTRY", label: "產業模板" },
  { key: "OCCASION", label: "活動情境" },
  { key: "SEASONAL", label: "節慶季節" },
] as const;
