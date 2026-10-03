import Image from "next/image";

export function StoreTestimonial() {
  return (
    <figure className="rounded-2xl border border-[#C39A51]/35 bg-white p-5 shadow-sm sm:p-7">
      <figcaption className="flex items-center gap-4">
        <Image src="/pricing/business-assets/nuanmu-logo.jpeg" alt="暖沐蒸足 Logo" width={80} height={80} className="h-20 w-20 shrink-0 rounded-full border border-[#153B31]/10 bg-white object-contain p-2" />
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-7">暖沐蒸足・台中店</p>
          <p className="mt-1 text-base text-[#4C6259]">店長 黃O詩</p>
          <p aria-label="店長評分：5 顆星，滿分 5 顆星" className="mt-2 text-xl tracking-widest text-[#967039]"><span aria-hidden="true">★★★★★</span></p>
        </div>
      </figcaption>
      <blockquote className="mt-5 text-lg leading-8 text-[#153B31]">
        <p>遇到臨時預約的客人，可以直接在當天的預約頁調整時段與名額，操作很快，現場安排也更方便。</p>
      </blockquote>
      <p className="mt-4 text-sm leading-6 text-[#64756D]">依店長週會分享整理</p>
    </figure>
  );
}
