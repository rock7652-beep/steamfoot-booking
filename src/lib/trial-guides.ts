export type GuideStep = {
  title: string;
  text: string;
  image?: string;
  highlight?: [number, number, number, number];
  link?: string;
  linkLabel?: string;
};
export type TrialGuide = { title: string; source?: string; steps: GuideStep[] };
const manager = "https://manager.line.biz/";
const permissionImage = "/pricing/trial-guides/oa-permissions.png";
export const trialGuides: Record<string, TrialGuide> = {
  "oa-admin": {
    title: "官方 LINE 管理員邀請",
    source:
      "https://tw.linebiz.com/manual/line-official-account/20200515elearningadmin/",
    steps: [
      {
        title: "開啟官方 LINE，選擇店家",
        text: "請用店家的管理員帳號登入電腦版後台。點右上角「設定」。",
        image: permissionImage,
        highlight: [94, 5, 6, 9],
        link: manager,
        linkLabel: "開啟官方 LINE 後台",
      },
      {
        title: "權限管理 → 新增成員",
        text: "左側點「權限管理」，再點右側「新增成員」。",
        image: permissionImage,
        highlight: [89, 31, 10, 9],
      },
      {
        title: "選管理員，發行網址",
        text: "權限選「管理員」，按「發行網址」。複製網址，回申請頁貼上。",
        image: "/pricing/trial-guides/oa-invite.png",
        highlight: [1, 72, 47, 15],
      },
      {
        title: "這個階段完成了",
        text: "蒸管家會用工作帳號接受邀請。連結 24 小時內有效、只能用一次；過期時重新產生並補件。",
      },
    ],
  },
  "line-id": {
    title: "查看官方 LINE ID",
    source:
      "https://tw.linebiz.com/manual/line-official-account/20200515elearningadmin/",
    steps: [
      {
        title: "登入店家的官方 LINE",
        text: "選擇正確店家。帳號名稱旁的 @ 開頭字串就是官方 LINE ID。",
        image: permissionImage,
        highlight: [15, 0, 14, 7],
        link: manager,
        linkLabel: "開啟官方 LINE 後台",
      },
      { title: "貼回申請頁", text: "連同 @ 一起複製。不要填個人 LINE ID。" },
    ],
  },
  friend: {
    title: "取得加入好友連結",
    source:
      "https://tw.linebiz.com/manual/line-official-account/oa-manager-addfriend/",
    steps: [
      {
        title: "增加好友人數 → 增加好友工具",
        text: "登入正確店家，在左側展開「增加好友人數」，點「增加好友工具」。",
        image: "/pricing/trial-guides/friend.png",
        highlight: [0, 75, 14, 9],
        link: manager,
        linkLabel: "開啟官方 LINE 後台",
      },
      {
        title: "點建立網址",
        text: "點線上宣傳區的「建立網址」，複製顯示的加好友網址，回申請頁貼上。",
        image: "/pricing/trial-guides/friend.png",
        highlight: [17, 14, 13, 32],
      },
    ],
  },
  developers: {
    title: "LINE Developers 管理員授權",
    source:
      "https://developers.line.biz/en/docs/line-developers-console/managing-roles/",
    steps: [
      {
        title: "選擇店家的 Provider",
        text: "開啟 Console，登入原本管理店家設定的帳號，選擇對應 Provider。找不到或沒有設定，回申請頁選「需要協助」。",
        link: "https://developers.line.biz/console/",
        linkLabel: "開啟 Developers Console",
      },
      {
        title: "Provider → Roles → Invite by email",
        text: "邀請 rock7652@gmail.com，角色選 Admin。Provider 權限不會自動套用到既有 Channel。",
      },
      {
        title: "既有 Channel 也需邀請",
        text: "分別進入店家的 Messaging API 與 LINE Login Channel，點 Roles → Invite by email，邀請同一 Email，角色選 Admin。沒有 Channel 時交由蒸管家協助。",
        image: "/pricing/trial-guides/developers-roles.webp",
        highlight: [10, 2, 16, 8],
      },
      {
        title: "回申請頁選已邀請",
        text: "蒸管家會確認權限，再設定登入、LIFF 與通知。不要自行重建 Provider、換 Webhook 或解除既有串接。",
      },
    ],
  },
  create: {
    title: "建立官方 LINE",
    source:
      "https://help2.line.me/official_account_tw/web/?contentId=20013137&lang=zh-Hant",
    steps: [
      {
        title: "開啟官方申請入口",
        text: "用店家自己管理的帳號申請。建議以電腦操作；手機可依官方頁面指示使用 LINE Official Account App。",
        image: "/pricing/trial-guides/create-entry.jpg",
        highlight: [11, 94, 15, 5],
        link: "https://tw.linebiz.com/account/",
        linkLabel: "免費開設官方 LINE",
      },
      {
        title: "填寫店家資料",
        text: "依 LINE 畫面填帳號名稱、Email、業種。確認是官方帳號申請，不是廣告帳號。",
      },
      {
        title: "確認資料並建立",
        text: "店家自行閱讀條款並完成建立。不需要購買專屬 ID 或先申請認證帳號。",
      },
      {
        title: "回原申請頁繼續填",
        text: "回蒸管家申請頁，選「有，我來填資料」，依欄位旁教學取得 ID、好友連結與管理員邀請。",
      },
    ],
  },
  maps: {
    title: "取得 Google 地圖連結",
    steps: [
      {
        title: "直接搜尋店家",
        text: "開啟 Google 地圖，搜尋店家名稱並選擇正確分店。沒有地圖資訊可略過。",
        link: "https://www.google.com/maps",
        linkLabel: "開啟 Google 地圖",
      },
      {
        title: "分享 → 複製連結",
        text: "在店家資訊點「分享」，複製連結，回申請頁貼上。",
      },
    ],
  },
};
