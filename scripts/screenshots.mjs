import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://127.0.0.1:3000';
const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

const pages = [
  { path: '/dashboard', name: 'dashboard-home' },
  { path: '/dashboard/customers', name: 'customers-list' },
  { path: '/dashboard/bookings/new', name: 'booking-new' },
  { path: '/dashboard/reports', name: 'reports' },
];

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const context = await browser.newContext();

  // Login
  const loginPage = await context.newPage();
  await loginPage.goto(`${BASE}/login`, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(2000);
  await loginPage.fill('input[name="email"]', 'alice@steamfoot.tw');
  await loginPage.fill('input[name="password"]', 'test1234');
  await loginPage.click('button[type="submit"]');
  // Wait for redirect by polling URL
  for (let i = 0; i < 30; i++) {
    await loginPage.waitForTimeout(2000);
    const url = loginPage.url();
    if (url.includes('/dashboard')) break;
  }
  console.log('Current URL after login:', loginPage.url());
  await loginPage.close();

  // Desktop screenshots (1440x900)
  for (const p of pages) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/${p.name}-desktop.png`, fullPage: false });
    console.log(`Desktop: ${p.name}`);
    await page.close();
  }

  // Mobile screenshots (390x844)
  for (const p of pages) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/${p.name}-mobile.png`, fullPage: false });
    console.log(`Mobile: ${p.name}`);
    await page.close();
  }

  // Sidebar collapse test
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/dashboard/customers`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    const collapseBtn = page.locator('button[aria-label="收合側邊欄"]');
    if (await collapseBtn.isVisible()) {
      await collapseBtn.click({ force: true });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/sidebar-collapsed.png`, fullPage: false });
      console.log('Sidebar collapsed');
    } else {
      console.log('Collapse button not found');
    }
    await page.close();
  }

  // Mobile hamburger overlay test
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/dashboard/customers`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    const hamburger = page.locator('button[aria-label="開啟選單"]');
    if (await hamburger.isVisible()) {
      await hamburger.click({ force: true });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/mobile-sidebar-open.png`, fullPage: false });
      console.log('Mobile sidebar open');
    } else {
      console.log('Hamburger button not found');
    }
    await page.close();
  }

  await browser.close();
  console.log('\nAll screenshots saved to', OUT);
}

run().catch(e => { console.error(e); process.exit(1); });
