import Link from "next/link";

export function MarketingFooter() {
  return <footer className="border-t border-[#153B31]/15 bg-[#F8F5EE] px-5 py-8 text-sm leading-6 text-[#4C6259] sm:px-8">
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-base font-semibold text-[#153B31]">蒸管家｜每一家店，都值得擁有一位數位管家。</p>
        <a href="/apply?intent=trial&utm_source=website&utm_medium=organic&utm_campaign=trial-interest&utm_content=footer" className="inline-flex min-h-11 items-center rounded-full bg-[#123E32] px-5 font-semibold text-white">申請體驗</a>
      </div>
      <nav aria-label="頁尾導覽" className="my-5 grid grid-cols-2 gap-x-6 sm:flex sm:flex-wrap">
        {[["/pricing/features", "功能介紹"], ["/pricing", "方案價格"], ["/cases", "店家案例"], ["/guides", "經營指南"], ["/#brands", "使用蒸管家的品牌"]].map(([href, label]) => <Link key={href} href={href} className="inline-flex min-h-11 items-center underline underline-offset-4">{label}</Link>)}
      </nav>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-[#153B31]/15 pt-5">
        <a href="mailto:steambutler500@gmail.com" className="break-all py-2">客服信箱：steambutler500@gmail.com</a>
        <a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="py-2 underline underline-offset-4">官方 LINE：@329rmywc</a>
      </div>
      <nav aria-label="政策與條款" className="flex flex-wrap gap-x-5">
        {[["/privacy", "隱私權政策"], ["/terms", "服務條款"], ["/refunds", "取消與退費政策"]].map(([href, label]) => <a key={href} href={href} className="inline-flex min-h-11 items-center underline underline-offset-4">{label}</a>)}
      </nav>
      <p className="mt-3">陸比音樂工作室｜統一編號：31789116<br />聯絡地址：新竹縣竹北市科大一路116號</p>
    </div>
  </footer>;
}
