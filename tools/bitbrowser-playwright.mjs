import { chromium } from '@playwright/test';

const BIT_API = process.env.BITBROWSER_API || 'http://127.0.0.1:54345';
const OUTPUT_DIR = 'output/playwright';

async function bitPost(path, body) {
  const response = await fetch(`${BIT_API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${path} failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`${path} failed: ${data.msg || JSON.stringify(data)}`);
  }

  return data.data;
}

async function listProfiles() {
  const data = await bitPost('/browser/list', { page: 0, pageSize: 100 });
  return data.list || [];
}

async function pickProfile(idOrSeq) {
  const profiles = await listProfiles();
  const running = profiles.filter(profile => profile.status === 1);

  if (idOrSeq) {
    const match = profiles.find(profile => profile.id === idOrSeq || String(profile.seq) === String(idOrSeq));
    if (!match) {
      throw new Error(`No BitBrowser profile found for id/seq: ${idOrSeq}`);
    }
    return match;
  }

  if (running.length > 0) {
    return running[0];
  }

  if (profiles.length > 0) {
    return profiles[0];
  }

  throw new Error('No BitBrowser profiles found.');
}

async function connect(profile) {
  const info = await bitPost('/browser/open', { id: profile.id });
  const endpoint = info.ws || `http://${info.http}`;
  const browser = await chromium.connectOverCDP(endpoint);
  return { browser, info };
}

function chooseWorkPage(browser) {
  const pages = browser.contexts().flatMap(context => context.pages());
  const nonConsolePage = pages.find(page => {
    const url = page.url();
    return !url.startsWith('https://console.bitbrowser.net/');
  });

  return nonConsolePage || pages[0];
}

async function commandList() {
  const profiles = await listProfiles();
  const rows = profiles.map(profile => ({
    seq: profile.seq,
    id: profile.id,
    status: profile.status === 1 ? 'running' : 'closed',
    name: profile.name || '',
    lastCountry: profile.lastCountry || '',
  }));
  console.table(rows);
}

async function commandPages(idOrSeq) {
  const profile = await pickProfile(idOrSeq);
  const { browser, info } = await connect(profile);
  try {
    const rows = [];
    for (const [contextIndex, context] of browser.contexts().entries()) {
      for (const [pageIndex, page] of context.pages().entries()) {
        rows.push({
          context: contextIndex,
          page: pageIndex,
          title: await page.title(),
          url: page.url(),
        });
      }
    }
    console.log(`BitBrowser seq=${profile.seq} id=${profile.id}`);
    console.log(`CDP http=${info.http}`);
    console.table(rows);
  } finally {
    await browser.close();
  }
}

async function commandGoto(url, idOrSeq) {
  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error('Usage: npm run bb:goto -- https://example.com [profileIdOrSeq]');
  }

  const profile = await pickProfile(idOrSeq);
  const { browser, info } = await connect(profile);
  try {
    const page = chooseWorkPage(browser) || await browser.contexts()[0].newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log(JSON.stringify({
      profileSeq: profile.seq,
      profileId: profile.id,
      cdpHttp: info.http,
      title: await page.title(),
      url: page.url(),
    }, null, 2));
  } finally {
    await browser.close();
  }
}

async function commandScreenshot(idOrSeq) {
  const profile = await pickProfile(idOrSeq);
  const { browser, info } = await connect(profile);
  try {
    const page = chooseWorkPage(browser);
    if (!page) {
      throw new Error('No page available for screenshot.');
    }
    await page.screenshot({ path: `${OUTPUT_DIR}/bitbrowser-current.png`, fullPage: true });
    console.log(JSON.stringify({
      profileSeq: profile.seq,
      profileId: profile.id,
      cdpHttp: info.http,
      title: await page.title(),
      url: page.url(),
      screenshot: `${OUTPUT_DIR}/bitbrowser-current.png`,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

const [command, arg1, arg2] = process.argv.slice(2);

try {
  if (command === 'list') {
    await commandList();
  } else if (command === 'pages') {
    await commandPages(arg1);
  } else if (command === 'goto') {
    await commandGoto(arg1, arg2);
  } else if (command === 'screenshot') {
    await commandScreenshot(arg1);
  } else {
    console.log(`Usage:
  npm run bb:list
  npm run bb:pages -- [profileIdOrSeq]
  npm run bb:goto -- https://example.com [profileIdOrSeq]
  npm run bb:screenshot -- [profileIdOrSeq]`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
