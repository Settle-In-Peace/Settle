import { chromium } from 'playwright';
const ctx = await chromium.launchPersistentContext('/tmp/brave-profile', {
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check'],
});
const page = await ctx.newPage();
await page.goto('https://myfreescorenow.com/api-integration', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
const url = page.url();
const text = await page.locator('body').innerText().catch(() => '');
console.log('URL:', url);
console.log('HAS_UPLOAD:', /upload|verification|drag.*drop/i.test(text));
console.log('HAS_LOGIN:', /log ?in|sign ?in|email.*password/i.test(text) && !/API User/i.test(text));
console.log('TEXT:', text.slice(0, 1500));
await page.screenshot({ path: '/tmp/mfsn-page.png', fullPage: false });
await ctx.close();
