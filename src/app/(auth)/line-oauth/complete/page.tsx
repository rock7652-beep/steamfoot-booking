interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LineOAuthCompletePage({ searchParams }: PageProps) {
  const { error } = await searchParams;
  // This is only a fail-closed error page. The successful handoff is entirely
  // server-driven by /api/line-oauth/taichung/coordinator.
  return (
    <main className="mx-auto max-w-sm px-4 py-12 text-center">
      <p className="text-sm text-red-700">
        無法完成 LINE 登入（{error ?? "completion_not_started"}）。
      </p>
      <a
        className="mt-4 inline-block rounded-md bg-[#06C755] px-4 py-2 text-sm font-medium text-white"
        href="/api/line-oauth/taichung/start"
      >
        重新從暖沐 LINE 登入
      </a>
    </main>
  );
}
