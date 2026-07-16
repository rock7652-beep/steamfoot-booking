import { prisma } from "@/lib/db";
import { googleReviewUrlSchema } from "@/lib/google-review";

export const dynamic = "force-dynamic";

const NOT_FOUND_RESPONSE = () => new Response("找不到該連結", { status: 404 });

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const token = new URL(request.url).searchParams.get("i");
  if (!token) return NOT_FOUND_RESPONSE();

  const store = await prisma.store.findUnique({
    where: { slug },
    select: { id: true, googleReviewUrl: true },
  });
  const parsedUrl = googleReviewUrlSchema.safeParse(store?.googleReviewUrl);
  if (!store || !parsedUrl.success) return NOT_FOUND_RESPONSE();

  const invite = await prisma.googleReviewInvite.findFirst({
    where: { token, storeId: store.id },
    select: { id: true },
  });
  if (!invite) return NOT_FOUND_RESPONSE();

  await prisma.googleReviewInvite.updateMany({
    where: { id: invite.id, clickedAt: null },
    data: { clickedAt: new Date() },
  });

  return Response.redirect(parsedUrl.data, 307);
}
