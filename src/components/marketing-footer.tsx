
export function MarketingFooter() {
  return <footer className="border-t border-[#153B31]/15 bg-[#F8F5EE] px-5 py-8 text-sm leading-6 text-[#4C6259] sm:px-8">
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-base font-semibold text-[#153B31]">蒸管家｜每一家店，都值得擁有一位數位管家。</p>
      </div>
      <nav aria-label="頁尾導覽" className="my-5 grid grid-cols-2 gap-x-6 sm:flex sm:flex-wrap">
        {[["/pricing/features", "功能介紹"], ["/pricing", "方案價格"], ["/cases", "店家案例"], ["/guides", "經營指南"], ["/#brands", "使用蒸管家的品牌"], ["#contact", "聯繫我們"]].map(([href, label]) => <a key={href} href={href} className="inline-flex min-h-11 items-center underline underline-offset-4">{label}</a>)}
      </nav>
      <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-24 border-t border-[#153B31]/15 pt-5">
        <h2 id="contact-heading" className="text-lg font-semibold text-[#153B31]">聯繫我們</h2>
        <p className="mt-2">想了解功能或討論店裡的需求？歡迎來信或加 LINE 聊聊。</p>
        <div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">
          <div><a href="mailto:steambutler500@gmail.com" className="flex min-h-12 items-center justify-center rounded-full border border-[#123E32] px-5 font-semibold text-[#123E32] hover:bg-[#E9F1EB] focus-visible:outline-2 focus-visible:outline-offset-4">寄信給我們</a><p className="mt-2 break-all text-center">steambutler500@gmail.com</p></div>
          <div><a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center rounded-full bg-[#123E32] px-5 font-semibold text-white hover:bg-[#245A49] focus-visible:outline-2 focus-visible:outline-offset-4">加 LINE 聊聊</a><p className="mt-2 text-center">官方 LINE：@329rmywc</p></div>
        </div>
      </section>
      <nav aria-label="政策與條款" className="flex flex-wrap gap-x-5">
        {[["/privacy", "隱私權政策"], ["/terms", "服務條款"], ["/refunds", "取消與退費政策"]].map(([href, label]) => <a key={href} href={href} className="inline-flex min-h-11 items-center underline underline-offset-4">{label}</a>)}
      </nav>
      <p className="mt-3">陸比音樂工作室｜統一編號：31789116<br />聯絡地址：新竹縣竹北市科大一路116號</p>
    </div>
  </footer>;
}
