import { LineOAuthComplete } from "./line-oauth-complete";

export default async function LineOAuthCompletePage() {
  // This completion is store-bound by the signed bridge cookie. Never accept a
  // caller-controlled redirect target here.
  return <LineOAuthComplete callbackUrl="/s/taichung/book" />;
}
