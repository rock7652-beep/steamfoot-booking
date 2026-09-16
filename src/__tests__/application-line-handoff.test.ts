import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const closes: (() => void)[] = [];
afterEach(() => closes.splice(0).forEach(close => close()));
function setup(page: string, data: object) {
  const html = readFileSync(`public/pricing/${page}.html`, 'utf8');
  const dom = new JSDOM(html, {url: 'https://www.steamfoot.com/', runScripts: 'outside-only'});
  const w = dom.window;
  closes.push(() => w.close());
  w.scrollTo = vi.fn();
  w.HTMLElement.prototype.scrollIntoView = vi.fn();
  w.fetch = vi.fn();
  if (page === 'apply') {
    w.sessionStorage.setItem('steam-butler-application', JSON.stringify({state: 'saved', payload: data}));
    w.eval(w.document.querySelector('script').textContent);
  } else {
    w.sessionStorage.setItem('steam-butler-fitness-intake-v2', JSON.stringify({state: 'saved', data}));
    w.eval(readFileSync('public/pricing/fitness.js', 'utf8'));
  }
  return {w, doc: w.document};
}
describe('saved application LINE handoff', () => {
  it.each(['apply', 'fitness'])('restores %s receipt with safely encoded store name and never submits again', page => {
    const storeName = '暖暖 & A? #<店> 😊';
    const {doc, w} = setup(page, {requestId: 'test-receipt', contactWay: '申請體驗帳號', storeName});
    const href = doc.getElementById('lineHandoffLink').href;
    expect(href.split('?')[0]).toBe('https://line.me/R/oaMessage/%40329rmywc/');
    expect(decodeURIComponent(href.split('?')[1])).toBe('我已申請體驗，店名：' + storeName);
    expect(doc.getElementById('lineHandoffMessage').value).toContain(storeName);
    expect(doc.getElementById('lineHandoff').textContent).toContain('請再按「送出」');
    expect(w.fetch).not.toHaveBeenCalled();
  });
  it.each(['apply', 'fitness'])('handles old %s receipt without store name', page => {
    const {doc} = setup(page, {requestId: 'legacy', contactWay: '先透過 LINE 了解'});
    expect(doc.getElementById('lineHandoffMessage').value).toBe('我已填寫需求表單，店名：（請填寫店名）');
    expect(doc.getElementById('lineHandoffLink').textContent).toBe('回 LINE，接續聊需求');
  });
  it('honors no-contact choice', () => {
    const {doc} = setup('fitness', {requestId: 'no-contact', contactWay: '目前暫不考慮'});
    expect(doc.getElementById('lineHandoff').hidden).toBe(true);
    expect(doc.getElementById('successText').textContent).toContain('不會主動聯絡');
  });
  it('preserves telephone contact preference', () => {
    const {doc} = setup('apply', {requestId: 'phone', contactWay: '希望電話聯繫', phone: true});
    expect(doc.getElementById('lineHandoffHint').textContent).toContain('我們會依您留下的電話聯繫');
  });
  it.each(['apply', 'fitness'])('offers copy and manual selection if clipboard is unavailable on %s', async page => {
    const {doc, w} = setup(page, {requestId: 'copy', contactWay: '申請體驗帳號', storeName: '測試店'});
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(w.navigator, 'clipboard', {value: {writeText}});
    await doc.getElementById('lineHandoffCopy').onclick();
    expect(writeText).toHaveBeenCalledWith('我已申請體驗，店名：測試店');
    expect(doc.getElementById('lineHandoffCopyStatus').textContent).toContain('已複製');
    writeText.mockRejectedValueOnce(new Error('denied'));
    await doc.getElementById('lineHandoffCopy').onclick();
    expect(doc.activeElement.id).toBe('lineHandoffMessage');
    expect(doc.getElementById('lineHandoffCopyStatus').textContent).toContain('已選取');
  });
});
