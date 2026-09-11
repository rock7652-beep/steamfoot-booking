import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "隱私權政策｜蒸管家",
  description: "蒸管家對個人資料、預約資料與通訊平台資料的蒐集、使用及刪除說明。",
};

const sections = [
  {
    title: "一、適用範圍",
    paragraphs: [
      "本政策適用於蒸管家網站、會員預約系統，以及透過 LINE、Messenger from Meta 等通訊平台提供的預約、提醒與顧客服務。",
      "各通訊平台另有自己的隱私權政策與使用條款；您使用該平台時，也會受到其規範。",
    ],
  },
  {
    title: "二、我們可能蒐集的資料",
    bullets: [
      "基本資料：姓名、電話、電子郵件及您主動提供的聯絡資訊。",
      "平台識別資料：LINE 使用者識別碼、Messenger 專頁範圍使用者識別碼（PSID）、顯示名稱、頭像及訊息來源。",
      "互動資料：您傳送的訊息、按鈕選擇、客服轉接狀態與必要的對話紀錄。",
      "預約與服務資料：門市、日期、時間、人數、預約狀態、確認、改期或取消紀錄。",
      "系統資料：為維護安全與排除異常所需的時間、裝置、瀏覽器及技術紀錄。",
    ],
  },
  {
    title: "三、資料使用目的",
    bullets: [
      "建立及管理預約、會員與顧客服務。",
      "依您選擇的原通訊管道傳送預約確認、行前提醒、改期或取消資訊。",
      "辨識同一位顧客、回覆詢問及協助轉接門市人員。",
      "維護帳號安全、預防濫用、排除系統異常並改善服務品質。",
      "履行依法應辦理的通知、帳務或紀錄保存義務。",
    ],
  },
  {
    title: "四、資料分享與第三方服務",
    paragraphs: [
      "我們只會在提供服務所需的範圍內，讓您選擇的門市及經授權人員存取資料。除法律要求、保護權益或取得您的同意外，我們不會出售您的個人資料。",
      "系統可能使用 Meta（Messenger）、LINE、Google 表單資料處理服務、綠界科技（金流啟用並付款時）、網站託管、資料庫、電子郵件及其他必要技術服務。這些服務商僅在執行其服務所需的範圍內處理資料，並受其各自條款與隱私政策約束。",
    ],
  },
  {
    title: "五、資料保存與安全",
    paragraphs: [
      "我們會在提供服務、處理爭議、維護安全及遵守法令所必要的期間保存資料；目的消失或期限屆滿後，會依適用法令刪除、去識別化或停止使用。",
      "我們採取權限控管、加密或雜湊、存取紀錄及其他合理措施保護資料。但網路傳輸無法保證絕對安全，請勿在對話中傳送密碼、完整付款卡號或其他不必要的敏感資訊。",
    ],
  },
  {
    title: "六、您的權利與資料刪除",
    paragraphs: [
      "您可依法請求查詢、閱覽、製給複製本、補充或更正、停止蒐集、處理或利用，以及刪除個人資料，也可以停止接收非必要通知。",
      "如需刪除 Messenger、LINE 或蒸管家帳號相關資料，請來信至下方聯絡信箱，主旨註明「蒸管家資料刪除申請」，並提供可供核對的姓名、手機末三碼、使用門市及使用的平台。我們只會要求完成身分核對所必要的資訊，並在確認後處理及回覆；依法或為處理既有交易所必須保留的資料可能不會立即刪除。",
    ],
  },
  {
    title: "七、未成年人",
    paragraphs: [
      "未成年人使用本服務時，應由法定代理人閱讀並同意本政策；如您認為未成年人未經適當同意提供資料，請聯絡我們。",
    ],
  },
  {
    title: "八、政策更新",
    paragraphs: [
      "我們可能因服務或法令調整更新本政策，並在本頁公布最新版本。重大變更時，會以適當方式通知。",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-earth-50 px-4 py-10 sm:py-14">
      <article className="mx-auto max-w-3xl rounded-2xl border border-earth-200 bg-white p-6 shadow-sm sm:p-10">
        <header className="border-b border-earth-200 pb-6">
          <p className="text-sm font-medium text-primary-600">蒸管家</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-earth-900">
            隱私權政策
          </h1>
          <p className="mt-3 text-sm leading-6 text-earth-500">
            最後更新日期：2026 年 9 月 11 日
          </p>
        </header>

        <div className="mt-8 space-y-8">
          <section>
            <p className="leading-7 text-earth-700">
              蒸管家重視您的隱私。本政策說明我們在提供預約、會員、提醒及顧客服務時，如何蒐集、使用、保存與保護資料。
            </p>
          </section>

          <section id="store-application">
<h2 className="text-xl font-semibold text-earth-900">店家申請個人資料告知</h2>
<p className="mt-3 leading-7 text-earth-700">陸比音樂工作室｜統一編號：31789116；聯絡地址：新竹縣竹北市科大一路116號；聯絡信箱：steambutler500@gmail.com。</p>
<p className="mt-3 leading-7 text-earth-700">申請資料用於需求評估、安排示範或體驗、回覆聯繫、後續建置及契約與帳務處理；來源參數及技術紀錄用於分析申請來源、維護安全與排除送出異常。送出申請不代表同意接收一般行銷訊息或授權付款。</p>
<p className="mt-3 leading-7 text-earth-700">蒐集類別包括店家名稱、聯絡人稱呼、電話或 LINE ID、產業與門市規模、員工及顧客人數區間、現有系統、需求與聯繫偏好，以及頁面網址、來源網址、活動參數、裝置類型及申請識別碼。請勿於自由填寫欄位提供顧客名冊、健康資料或付款卡號。</p>
<p className="mt-3 leading-7 text-earth-700">使用期間以處理申請、後續服務關係、爭議與依法保存所必要期間為限；目的消失後刪除、去識別化或停止利用。利用地區為臺灣及所使用雲端服務商提供儲存、備援或支援服務的境外地區。</p>
<p className="mt-3 leading-7 text-earth-700">使用對象為本工作室授權人員及受委託的必要服務商（包括承接申請資料的 Google 雲端服務、網站託管與通訊服務商），以電子儲存、內部查詢及您提供的聯絡方式處理；不出售資料，不為不相容目的任意提供第三方。</p>
<p className="mt-3 leading-7 text-earth-700">您可來信行使查詢、閱覽、製給複製本、補充或更正、停止蒐集／處理／利用、刪除等法定權利；依法須保留部分資料時，會說明原因。</p>
<p className="mt-3 leading-7 text-earth-700">您可自由決定是否提供資料；標示必填的需求資料，以及電話或 LINE ID 至少一項，是完成本次申請及聯繫所必要。不提供將無法完成表單申請或安排服務，仍可直接來信洽詢；選填資料不影響基本申請。若另提供行銷訂閱，將另行徵求選填同意、不預先勾選，並提供退出方式。</p>
</section>

          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-earth-900">{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 leading-7 text-earth-700">
                  {paragraph}
                </p>
              ))}
              {section.bullets && (
                <ul className="mt-3 list-disc space-y-2 pl-6 leading-7 text-earth-700">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section className="rounded-xl bg-earth-50 p-5">
            <h2 className="text-xl font-semibold text-earth-900">九、聯絡我們</h2>
            <p className="mt-3 leading-7 text-earth-700">
              隱私權、資料查詢或刪除申請，請寄至：
              <a
                className="ml-1 font-medium text-primary-700 underline underline-offset-4"
                href="mailto:steambutler500@gmail.com"
              >
                steambutler500@gmail.com
              </a>
            </p>
            <p className="mt-2 leading-7 text-earth-700">
              為保護您的資料，我們會在處理申請前進行合理的身分核對。
            </p>
          </section>
        </div>

        <footer className="mt-10 border-t border-earth-200 pt-6 text-center"><p className="mb-4 text-sm leading-7 text-earth-700"><a href="/pricing/terms.html">服務條款</a> · <a href="/pricing/refunds.html">取消與退費政策</a></p>
          <Link
            href="/"
            className="text-sm font-medium text-primary-700 hover:text-primary-800"
          >
            返回蒸管家
          </Link>
        </footer>
      </article>
    </main>
  );
}
