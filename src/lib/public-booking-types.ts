export const BOOKING_TYPES = [
  {
    id: "slots",
    name: "時段預約",
    question: "幾點還能接幾位？",
    who: "蒸足、岩盤浴、桑拿、親子遊戲",
    detail: "固定時段、接待名額與當日名單",
    cta: "看時段預約",
  },
  {
    id: "beauty",
    name: "美業模組",
    question: "顧客約哪位服務人員，要做哪些項目？",
    who: "美容、美體、美甲、美睫、按摩、SPA",
    detail: "服務項目、人員安排與顧客預約",
    cta: "看美業模組",
  },
  {
    id: "fitness",
    name: "運動課程",
    question: "哪堂課，還有幾個名額？",
    who: "運動教室、瑜珈、皮拉提斯",
    detail: "課表、學員預約與出席紀錄",
    cta: "看運動教室",
  },
  {
    id: "music",
    name: "音樂課程",
    question: "誰跟哪位老師上課？",
    who: "音樂教室、樂器教學、才藝課程",
    detail: "固定課、調課補課與老師鐘點",
    cta: "看音樂教室",
  },
] as const;
