import { Suspense } from "react";
import ActivateVerifyForm from "./activate-verify-form";

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
