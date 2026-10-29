export function LiffSignedOutView({ storeSlug, contactUrl }: { storeSlug: string; contactUrl: string }) {
  return <section className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8">
    <h1 className="text-xl font-semibold text-earth-900">已登出會員專區</h1>
    <p className="text-base leading-7 text-earth-700">若剛才顯示的姓名或手機不是本人，請聯繫門市核對會員資料。</p>
    <a href={`/s/${storeSlug}/liff`} className="flex min-h-12 items-center justify-center rounded-xl bg-primary-700 px-4 py-3 text-base font-semibold text-white">重新登入</a>
    {contactUrl && <a href={contactUrl} className="flex min-h-12 items-center justify-center rounded-xl border border-earth-300 bg-white px-4 py-3 text-base font-semibold text-earth-700">聯繫門市</a>}
  </section>;
}
