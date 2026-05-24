import { expect, test } from '@playwright/test';

const bitbrowserApi = process.env.BITBROWSER_API || 'http://127.0.0.1:54345';
const profileSeqOrId = process.env.BITBROWSER_PROFILE;

type BitProfile = {
  id: string;
  seq: number;
  status: number;
};

async function bitPost(path: string, body: unknown) {
  const response = await fetch(`${bitbrowserApi}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  expect(response.ok, `${path} returned HTTP ${response.status}`).toBe(true);

  const payload = await response.json();
  expect(payload.success, payload.msg || `${path} failed`).toBe(true);
  return payload.data;
}

async function findProfile(): Promise<BitProfile> {
  const data = await bitPost('/browser/list', { page: 0, pageSize: 100 });
  const profiles = data.list as BitProfile[];

  if (profileSeqOrId) {
    const match = profiles.find(profile => profile.id === profileSeqOrId || String(profile.seq) === profileSeqOrId);
    expect(match, `No BitBrowser profile found for ${profileSeqOrId}`).toBeTruthy();
    return match!;
  }

  const running = profiles.find(profile => profile.status === 1);
  expect(running, 'No running BitBrowser profile found. Open one first.').toBeTruthy();
  return running!;
}

test('replay recorded flow in BitBrowser', async ({ playwright }) => {
  const profile = await findProfile();
  const openInfo = await bitPost('/browser/open', { id: profile.id });
  const browser = await playwright.chromium.connectOverCDP(openInfo.ws || `http://${openInfo.http}`);

  try {
    const context = browser.contexts()[0] || await browser.newContext();
    const pages = context.pages();
    const page =
      pages.find(item => !item.url().startsWith('https://console.bitbrowser.net/')) ||
      pages[0] ||
      await context.newPage();

    await page.goto('https://jina.ai/', { waitUntil: 'domcontentloaded' });
    await page.locator('#uc-overlay').click();
    await page.locator('#uc-overlay').click();
    await page.getByRole('button', { name: '拒绝' }).click();
    await page.getByRole('button', { name: '获取响应' }).click();
    await page.getByRole('button').filter({ hasText: 'sync' }).click();
    await page.getByRole('button').filter({ hasText: 'sync' }).click();
    await page.getByRole('button', { name: '获取响应 (0.9 s)' }).click();
    await page.getByRole('button').filter({ hasText: 'sync' }).click();
    await page.getByRole('button', { name: '刷新' }).click();
    await page.getByRole('button').filter({ hasText: 'content_copy' }).nth(1).click();

    await page.screenshot({ path: 'output/playwright/bitbrowser-recorded-flow.png', fullPage: true });
  } finally {
    await browser.close();
  }
});
