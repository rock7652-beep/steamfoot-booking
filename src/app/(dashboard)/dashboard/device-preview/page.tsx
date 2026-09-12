import { notFound } from "next/navigation";
import { DevicePreview } from "@/components/device-preview/device-preview";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

interface DevicePreviewPageProps {
  searchParams: Promise<{ devicePreview?: string }>;
}

export default async function DevicePreviewPage({ searchParams }: DevicePreviewPageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) {
    notFound();
  }

  // This route is deliberately excluded from the iframe allowlist. Render a
  // clear state for manual attempts rather than allowing preview recursion.
  const params = await searchParams;
  if (params.devicePreview === "1") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl items-center justify-center p-6 text-center">
        <div className="rounded-xl border border-earth-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-earth-900">此頁面目前尚未支援裝置預覽</h1>
          <p className="mt-2 text-sm text-earth-600">請從裝置預覽工具選擇支援的頁面。</p>
        </div>
      </div>
    );
  }

  return <DevicePreview />;
}
