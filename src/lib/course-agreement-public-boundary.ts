import { NextResponse, type NextRequest } from 'next/server';
import { blocksFrontendPreviewWrite } from './frontend-preview';
import { isCourseAgreementPublicPath, COURSE_AGREEMENT_PRIVATE_HEADERS } from './course-agreement-public-path';
export function courseAgreementPublicBoundary(req: NextRequest, enabled: boolean, guidePreview: boolean) {
  const path = req.nextUrl.pathname;
  if (path !== '/course-agreements' && !path.startsWith('/course-agreements/')) return null;
  if (!enabled || guidePreview || !isCourseAgreementPublicPath(path)) return new NextResponse('Not found', { status: 404, headers: COURSE_AGREEMENT_PRIVATE_HEADERS });
  if (blocksFrontendPreviewWrite(req.method, path, req.headers.get('referer'))) return NextResponse.json({ error: '預覽中不會儲存' }, { status: 403, headers: COURSE_AGREEMENT_PRIVATE_HEADERS });
  const methods = path.startsWith('/course-agreements/receipt/') ? ['GET', 'HEAD'] : ['GET', 'HEAD', 'POST'];
  if (!methods.includes(req.method)) return new NextResponse('Method not allowed', { status: 405, headers: { ...COURSE_AGREEMENT_PRIVATE_HEADERS, Allow: methods.join(', ') } });
  return NextResponse.next({ headers: COURSE_AGREEMENT_PRIVATE_HEADERS });
}
