import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const scriptPath = process.argv[2];
const profile = process.argv[3] || process.env.BITBROWSER_PROFILE || '';

if (!scriptPath) {
  console.error('Usage: node tools/run-saved-flow-in-bitbrowser.mjs tests/saved-flows/name.spec.ts [profileSeqOrId]');
  process.exit(1);
}

function toRepoPath(value) {
  return path.isAbsolute(value) ? value : path.join(root, value);
}

function extractRecordedBody(source) {
  const marker = /test\s*\(\s*['"`][^'"`]*['"`]\s*,\s*async\s*\(\s*\{\s*page\s*\}\s*\)\s*=>\s*\{/m;
  const match = marker.exec(source);
  if (!match) {
    throw new Error('Could not find a Playwright test body with async ({ page }) => { ... }.');
  }

  let index = match.index + match[0].length;
  let depth = 1;
  let quote = null;
  let escaped = false;

  for (; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(match.index + match[0].length, index).trim();
      }
    }
  }

  throw new Error('Could not find the end of the recorded Playwright test body.');
}

const source = await readFile(toRepoPath(scriptPath), 'utf8');
const body = extractRecordedBody(source);

if (!/await\s+page\./.test(body)) {
  throw new Error('The selected script does not appear to contain recorded page actions.');
}

await mkdir(path.join(root, 'output', 'playwright'), { recursive: true });
await mkdir(path.join(root, 'tests', 'generated'), { recursive: true });

const generatedPath = path.join(root, 'tests', 'generated', 'bitbrowser-flow.generated.spec.ts');
const generatedTestArg = 'generated/bitbrowser-flow.generated.spec.ts';
const generated = `import { expect, test } from '@playwright/test';
import { appendCsvRow, readClipboardText } from '../helpers/local-automation';

const bitbrowserApi = process.env.BITBROWSER_API || 'http://127.0.0.1:54345';
const profileSeqOrId = process.env.BITBROWSER_PROFILE;

type BitProfile = {
  id: string;
  seq: number;
  status: number;
};

async function bitPost(path: string, body: unknown) {
  const response = await fetch(\`\${bitbrowserApi}\${path}\`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  expect(response.ok, \`\${path} returned HTTP \${response.status}\`).toBe(true);

  const payload = await response.json();
  expect(payload.success, payload.msg || \`\${path} failed\`).toBe(true);
  return payload.data;
}

async function findProfile(): Promise<BitProfile> {
  const data = await bitPost('/browser/list', { page: 0, pageSize: 100 });
  const profiles = data.list as BitProfile[];

  if (profileSeqOrId) {
    const match = profiles.find(profile => profile.id === profileSeqOrId || String(profile.seq) === profileSeqOrId);
    expect(match, \`No BitBrowser profile found for \${profileSeqOrId}\`).toBeTruthy();
    return match!;
  }

  const running = profiles.find(profile => profile.status === 1);
  expect(running, 'No running BitBrowser profile found. Open one first.').toBeTruthy();
  return running!;
}

test('run saved flow in BitBrowser', async ({ playwright }) => {
  const profile = await findProfile();
  const openInfo = await bitPost('/browser/open', { id: profile.id });
  const browser = await playwright.chromium.connectOverCDP(openInfo.ws || \`http://\${openInfo.http}\`);

  try {
    const context = browser.contexts()[0] || await browser.newContext();
    const pages = context.pages();
    const page =
      pages.find(item => !item.url().startsWith('https://console.bitbrowser.net/')) ||
      pages[0] ||
      await context.newPage();
    page.setDefaultTimeout(Number(process.env.PW_ACTION_TIMEOUT || 15000));
    page.setDefaultNavigationTimeout(Number(process.env.PW_NAVIGATION_TIMEOUT || 45000));

${body
  .split('\n')
  .map(line => `    ${line}`)
  .join('\n')}

    await page.screenshot({ path: 'output/playwright/last-bitbrowser-run.png', fullPage: true });
  } finally {
    await browser.close();
  }
});
`;

await writeFile(generatedPath, generated, 'utf8');

const env = { ...process.env };
if (profile) {
  env.BITBROWSER_PROFILE = profile;
}

const child =
  process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/c', `npx playwright test ${generatedTestArg} --headed --workers=1 --timeout=120000`], {
        cwd: root,
        env,
        stdio: 'inherit',
      })
    : spawn('npx', ['playwright', 'test', generatedTestArg, '--headed', '--workers=1', '--timeout=120000'], {
        cwd: root,
        env,
        stdio: 'inherit',
      });

child.on('exit', code => {
  process.exit(code ?? 1);
});
