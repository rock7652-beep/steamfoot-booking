import { LineOAuthComplete } from "./line-oauth-complete";

export default async function LineOAuthCompletePage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  return <LineOAuthComplete callbackUrl={callbackUrl ?? "/s/taichung/book"} />;
}
