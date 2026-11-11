import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiffSignedOutView } from '@/app/(liff)/liff/signed-out/signed-out-view';
describe('signed-out member landing',()=>{
 it('requires an explicit same-store login link and does not render an auto-submit or login frame',()=>{
  const html=renderToStaticMarkup(createElement(LiffSignedOutView,{storeSlug:'synthetic-store',contactUrl:''}));
  expect(html).toContain('已登出會員專區');expect(html).toContain('href="/s/synthetic-store/liff"');expect(html).not.toMatch(/<script|<form|<iframe|http-equiv=/);
 });
 it('offers the configured store contact without changing the login destination',()=>{
  const html=renderToStaticMarkup(createElement(LiffSignedOutView,{storeSlug:'synthetic-store',contactUrl:'https://example.com/contact'}));
  expect(html).toContain('href="https://example.com/contact"');expect(html).toContain('重新登入');
 });
});
