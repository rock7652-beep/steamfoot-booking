// ============================================================
// LINE Webhook — 最簡測試版本（等 Verify 成功後再補回邏輯）
// ============================================================

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  console.log("[LINE Webhook] POST hit", {
    url: req.url,
    method: req.method,
    contentType: req.headers.get("content-type"),
    bodyLength: body.length,
    bodyPreview: body.slice(0, 200),
  });
  return new Response("OK", { status: 200 });
}

export async function GET(req: Request) {
  console.log("[LINE Webhook] GET hit", { url: req.url });
  return new Response("OK", { status: 200 });
}
