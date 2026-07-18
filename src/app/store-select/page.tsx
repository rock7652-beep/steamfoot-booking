import Link from "next/link";

export default function StoreSelectPage() {
  return <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 text-center"><h1 className="text-xl font-bold text-earth-900">請選擇您的店舖入口</h1><p className="mt-3 text-sm text-earth-600">店舖資訊遺失，請由店家提供的專屬連結重新進入。</p><Link href="/" className="mt-6 text-sm text-primary-700 underline">回首頁</Link></main>;
}
