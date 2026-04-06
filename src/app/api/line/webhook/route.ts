// ============================================================
// LINE Webhook — 最簡測試版本（等 Verify 成功後再補回邏輯）
// ============================================================

export async function POST(req: Request) {
  console.log("[LINE] webhook hit");
  return new Response("OK", { status: 200 });
}

export async function GET() {
  return new Response("OK", { status: 200 });
}
