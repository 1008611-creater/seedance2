import { expect, test } from '@playwright/test';
import { appendCsvRow, readClipboardText } from '../helpers/local-automation';

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

test('run saved flow in BitBrowser', async ({ playwright }) => {
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
    page.setDefaultTimeout(Number(process.env.PW_ACTION_TIMEOUT || 15000));
    page.setDefaultNavigationTimeout(Number(process.env.PW_NAVIGATION_TIMEOUT || 45000));

    await page.goto('https://example.com/');
      await expect(page).toHaveURL(/example\.com/);
      const firstTitle = await page.title();
    
      await page.goto('https://example.org/');
      await expect(page).toHaveURL(/example\.org/);
      const secondTitle = await page.title();
    
      await appendCsvRow('output/multi-url/same-tab.csv', [new Date().toISOString(), firstTitle, secondTitle], {
        header: ['savedAt', 'firstTitle', 'secondTitle'],
      });

    await page.screenshot({ path: 'output/playwright/last-bitbrowser-run.png', fullPage: true });
  } finally {
    await browser.close();
  }
});
