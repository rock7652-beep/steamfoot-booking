// Owner-provided five-turn acceptance, with editorial reference answers.
// Fake transport checks wiring and guards, not real-model communication quality.
export const beautyStudioQualityConversation = [
  {
    question:
      "我跟太太一起開美容工作室，目前都用LINE預約，你們的系統適合我們嗎？",
    answer:
      "適合，你們可以先把服務項目、人員安排與預約集中管理，也能保留由店家協助登記的方式。\n\n你們現在最想改善的是漏記預約，還是來回確認時間？",
    sourceIds: ["module-beauty"],
  },
  {
    question: "多少錢",
    answer:
      "以你們目前的兩人工作室需求，可以先看基本版：月繳每期 NT$1,480，最低承諾12個月。\n\n若之後需要進階管理，再依需求確認方案即可。",
    sourceIds: ["plan-BASIC"],
  },
  {
    question: "怎麼試用",
    answer:
      "可以到這裡填寫門市需求：\nhttps://www.steamfoot.com/apply\n\n免費體驗30天，從帳號可正常使用當天起算；送出申請不會立即扣款。",
    sourceIds: ["trial"],
  },
  {
    question: "有範例嗎",
    answer:
      "你想看實際店家使用的案例，還是美容工作室的功能示意？兩者不同，我可以依你想了解的方向提供目前公開的資料。",
    sourceIds: ["public-cases", "module-beauty"],
  },
  {
    question: "我想看實體店面的範例",
    answer:
      "目前公開的實店案例是蒸足門市，還沒有可提供的美容工作室實例。\n\n可先參考暖暖蒸足的預約流程，但它不是美業案例：\nhttps://www.steamfoot.com/cases",
    sourceIds: ["public-cases"],
  },
];
