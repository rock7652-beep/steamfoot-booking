import { expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { courseAgreementPublicBoundary } from '@/lib/course-agreement-public-boundary';
const path='/course-agreements/'+'a'.repeat(43);
it('keeps unrelated routes on the existing proxy path',()=>{expect(courseAgreementPublicBoundary(new NextRequest('https://test.invalid/dashboard'),true,false)).toBeNull();});
it('fails closed for disabled, guide-only or malformed capability routes',()=>{
 expect(courseAgreementPublicBoundary(new NextRequest('https://test.invalid'+path),false,false)?.status).toBe(404);
 expect(courseAgreementPublicBoundary(new NextRequest('https://test.invalid'+path),true,true)?.status).toBe(404);
 expect(courseAgreementPublicBoundary(new NextRequest('https://test.invalid/course-agreements/admin'),true,false)?.status).toBe(404);
});
it('retains the global read-only preview write guard',()=>{const response=courseAgreementPublicBoundary(new NextRequest('https://test.invalid'+path,{method:'POST',headers:{referer:'https://test.invalid/hq/dashboard/frontend-preview'}}),true,false);expect(response?.status).toBe(403);});
it('sets no-store, no-referrer, no-index and frame protection on valid reads',()=>{const response=courseAgreementPublicBoundary(new NextRequest('https://test.invalid'+path),true,false)!;expect(response.headers.get('x-middleware-next')).toBe('1');expect(response.headers.get('cache-control')).toContain('no-store');expect(response.headers.get('referrer-policy')).toBe('no-referrer');expect(response.headers.get('x-robots-tag')).toContain('noindex');expect(response.headers.get('x-frame-options')).toBe('DENY');});
it('permits signing actions but refuses receipt mutations and unsupported methods',()=>{
 expect(courseAgreementPublicBoundary(new NextRequest('https://test.invalid'+path,{method:'POST'}),true,false)?.headers.get('x-middleware-next')).toBe('1');
 expect(courseAgreementPublicBoundary(new NextRequest('https://test.invalid/course-agreements/receipt/'+'a'.repeat(43),{method:'POST'}),true,false)?.status).toBe(405);
 expect(courseAgreementPublicBoundary(new NextRequest('https://test.invalid'+path,{method:'DELETE'}),true,false)?.status).toBe(405);
});
