import { clearStoreContextCookies } from "@/server/auth/clear-store-context";
import { HqLoginForm } from "./hq-login-form";

export default async function HqLoginPage() {
  // 進入 HQ 登入頁時清除任何殘留的 store context cookie，
  // 避免舊店後台 session 污染新登入流程。
  await clearStoreContextCookies();
  return <HqLoginForm />;
}
