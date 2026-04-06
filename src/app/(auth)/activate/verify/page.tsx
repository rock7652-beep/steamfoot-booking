import { Suspense } from "react";
import ActivateVerifyForm from "./activate-verify-form";

// 部署版本標記
export const BUILD_TAG = "v20260406-de7be7d-B";

export default function ActivateVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm text-center text-sm text-earth-400">
          載入中...
        </div>
      }
    >
      <ActivateVerifyForm />
    </Suspense>
  );
}
