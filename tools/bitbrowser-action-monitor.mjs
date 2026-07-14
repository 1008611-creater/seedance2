import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const bitbrowserApi = process.env.BITBROWSER_API || 'http://127.0.0.1:54345';

function usage() {
  console.log(`Usage:
  npm run bb:monitor -- [profileSeqOrId] [options]

Options:
  --profile <seqOrId>       BitBrowser profile seq/id. Positional arg also works.
  --name <slug>             Output session name. Default: action-monitor
  --duration <seconds>      Auto-stop after this many seconds. Default: run until Ctrl+C
  --include-text            Record typed text and input values. Default: off
  --all-pages               Include BitBrowser console pages. Default: off
  --output-root <path>      Directory for monitor packets
  --stop-file <path>        Stop when this file appears

Output:
  output/playwright/action-monitor/<name>-<timestamp>/events.jsonl
  output/playwright/action-monitor/<name>-<timestamp>/summary.md`);
}

function parseArgs(values) {
  const options = {
    profile: '',
    name: 'action-monitor',
    durationSec: 0,
    includeText: false,
    includeConsolePages: false,
    outputRoot: path.join(root, 'output', 'playwright', 'action-monitor'),
    stopFile: '',
    help: false,
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--help' || value === '-h') {
      options.help = true;
    } else if (value === '--profile') {
      options.profile = values[++index] || '';
    } else if (value === '--name') {
      options.name = values[++index] || options.name;
    } else if (value === '--duration') {
      options.durationSec = Number(values[++index] || 0);
    } else if (value === '--output-root') {
      options.outputRoot = values[++index] || options.outputRoot;
    } else if (value === '--stop-file') {
      options.stopFile = values[++index] || '';
    } else if (value === '--include-text') {
      options.includeText = true;
    } else if (value === '--all-pages') {
      options.includeConsolePages = true;
    } else if (!options.profile) {
      options.profile = value;
    } else {
      throw new Error(`Unexpected argument: ${value}`);
    }
  }

  if (!Number.isFinite(options.durationSec) || options.durationSec < 0) {
    throw new Error('--duration must be a positive number.');
  }

  options.name = String(options.name)
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'action-monitor';
  options.outputRoot = path.resolve(root, options.outputRoot);
  if (options.stopFile) {
    options.stopFile = path.resolve(root, options.stopFile);
  }

  return options;
}

async function bitPost(apiPath, body) {
  const response = await fetch(`${bitbrowserApi}${apiPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${apiPath} returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error(`${apiPath} failed: ${payload.msg || JSON.stringify(payload)}`);
  }

  return payload.data;
}

async function listProfiles() {
  const data = await bitPost('/browser/list', { page: 0, pageSize: 100 });
  return data.list || [];
}

async function pickProfile(seqOrId) {
  const profiles = await listProfiles();
  if (seqOrId) {
    const match = profiles.find(profile => profile.id === seqOrId || String(profile.seq) === String(seqOrId));
    if (!match) {
      throw new Error(`No BitBrowser profile found for ${seqOrId}`);
    }
    return match;
  }

  const running = profiles.find(profile => profile.status === 1);
  if (running) {
    return running;
  }

  if (profiles[0]) {
    return profiles[0];
  }

  throw new Error('No BitBrowser profiles found.');
}

function makeInjectedScript({ includeText, bindingName }) {
  return `(() => {
    if (window.__pwActionMonitorInstalled) return;
    window.__pwActionMonitorInstalled = true;

    const includeText = ${includeText ? 'true' : 'false'};
    const bindingName = ${JSON.stringify(bindingName)};
    const clean = value => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, 160);
    const isSecret = element => {
      const type = String(element?.getAttribute?.('type') || '').toLowerCase();
      const autocomplete = String(element?.getAttribute?.('autocomplete') || '').toLowerCase();
      return type === 'password' || autocomplete.includes('password') || /password|passcode|token|secret/i.test(element?.name || element?.id || '');
    };
    const cssEscape = value => {
      if (window.CSS && CSS.escape) return CSS.escape(value);
      return String(value).replace(/["\\\\]/g, '\\\\$&');
    };
    const nthOfType = element => {
      let index = 1;
      let sibling = element;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.tagName === element.tagName) index += 1;
      }
      return index;
    };
    const cssPath = element => {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
      if (element.id) return '#' + cssEscape(element.id);
      const parts = [];
      let current = element;
      for (let depth = 0; current && current.nodeType === Node.ELEMENT_NODE && depth < 5; depth += 1) {
        let part = current.tagName.toLowerCase();
        const testId = current.getAttribute('data-testid') || current.getAttribute('data-test') || current.getAttribute('data-cy');
        if (testId) {
          part += '[data-testid="' + cssEscape(testId) + '"]';
          parts.unshift(part);
          break;
        }
        if (current.classList.length > 0) {
          part += '.' + Array.from(current.classList).slice(0, 2).map(cssEscape).join('.');
        }
        part += ':nth-of-type(' + nthOfType(current) + ')';
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(' > ');
    };
    const roleHint = element => {
      const explicit = element.getAttribute?.('role');
      if (explicit) return explicit;
      const tag = element.tagName?.toLowerCase();
      if (tag === 'button') return 'button';
      if (tag === 'a' && element.getAttribute('href')) return 'link';
      if (tag === 'input') {
        const type = String(element.getAttribute('type') || 'text').toLowerCase();
        if (['button', 'submit', 'reset'].includes(type)) return 'button';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        return 'textbox';
      }
      if (tag === 'textarea') return 'textbox';
      if (tag === 'select') return 'combobox';
      return '';
    };
    const describe = target => {
      const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const attrs = {};
      for (const name of ['id', 'name', 'type', 'role', 'aria-label', 'placeholder', 'title', 'data-testid', 'data-test', 'data-cy', 'href']) {
        const value = element.getAttribute?.(name);
        if (value) attrs[name] = clean(value);
      }
      const text = isSecret(element) ? '' : clean(element.innerText || element.textContent || element.value || '');
      const role = roleHint(element);
      const accessibleName = clean(attrs['aria-label'] || attrs.title || attrs.placeholder || text);
      return {
        tag: element.tagName.toLowerCase(),
        role,
        accessibleName,
        text,
        attrs,
        selector: cssPath(element),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    };
    const valueInfo = target => {
      if (!target || !('value' in target)) return {};
      const value = String(target.value || '');
      if (isSecret(target)) {
        return { valueMasked: true, valueLength: value.length };
      }
      return includeText ? { value } : { valueMasked: true, valueLength: value.length };
    };
    const send = payload => {
      const binding = window[bindingName];
      if (typeof binding !== 'function') return;
      Promise.resolve(binding(payload)).catch(() => {});
    };
    const emit = (eventType, event, extra = {}) => {
      const payload = {
        eventType,
        browserTime: new Date().toISOString(),
        url: location.href,
        title: document.title,
        target: describe(event.target),
        pointer: 'clientX' in event ? { x: Math.round(event.clientX), y: Math.round(event.clientY), button: event.button } : undefined,
        modifiers: {
          alt: !!event.altKey,
          ctrl: !!event.ctrlKey,
          meta: !!event.metaKey,
          shift: !!event.shiftKey,
        },
        ...extra,
      };
      send(payload);
    };

    document.addEventListener('click', event => emit('click', event), true);
    document.addEventListener('dblclick', event => emit('dblclick', event), true);
    document.addEventListener('contextmenu', event => emit('contextmenu', event), true);
    document.addEventListener('change', event => emit('change', event, valueInfo(event.target)), true);
    document.addEventListener('input', event => emit('input', event, valueInfo(event.target)), true);
    document.addEventListener('keydown', event => {
      const key = includeText || event.key.length > 1 ? event.key : '<char>';
      emit('keydown', event, { key, code: event.code, repeat: event.repeat });
    }, true);
    send({
      eventType: 'monitor-ready',
      browserTime: new Date().toISOString(),
      url: location.href,
      title: document.title,
      target: {
        tag: 'document',
        role: '',
        accessibleName: '',
        text: '',
        attrs: {},
        selector: '',
        rect: { x: 0, y: 0, width: 0, height: 0 },
      },
    });
  })();`;
}

function selectorSnippet(target) {
  if (!target) return '';
  const attrs = target.attrs || {};
  if (attrs['data-testid']) return `locator('[data-testid="${attrs['data-testid']}"]')`;
  if (target.role && target.accessibleName) return `getByRole('${target.role}', { name: ${JSON.stringify(target.accessibleName)} })`;
  if (attrs.placeholder) return `getByPlaceholder(${JSON.stringify(attrs.placeholder)})`;
  if (attrs.name) return `locator('[name="${attrs.name}"]')`;
  if (attrs.id) return `locator('#${attrs.id}')`;
  return target.selector ? `locator(${JSON.stringify(target.selector)})` : '';
}

function eventToMarkdown(event, index) {
  const target = event.target;
  const selector = selectorSnippet(target);
  const detail = [
    event.eventType,
    event.key ? `key=${event.key}` : '',
    Number.isFinite(event.valueLength) ? `valueLength=${event.valueLength}` : '',
    event.value ? `value=${JSON.stringify(event.value)}` : '',
  ].filter(Boolean).join(', ');

  return `| ${index} | ${event.nodeTime} | ${event.eventType} | ${event.title || ''} | ${target?.tag || ''} | ${target?.accessibleName || target?.text || ''} | \`${selector}\` | ${detail} |`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const profile = await pickProfile(options.profile);
  const openInfo = await bitPost('/browser/open', { id: profile.id });
  const endpoint = openInfo.ws || `http://${openInfo.http}`;
  const browser = await chromium.connectOverCDP(endpoint);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(options.outputRoot, `${options.name}-${stamp}`);
  await mkdir(outDir, { recursive: true });
  const eventsPath = path.join(outDir, 'events.jsonl');
  const summaryPath = path.join(outDir, 'summary.md');
  const bindingName = `__pwActionMonitor_${Math.random().toString(36).slice(2)}`;
  const events = [];
  const pageStates = new WeakMap();
  const watchedContexts = new WeakSet();
  const script = makeInjectedScript({ includeText: options.includeText, bindingName });

  async function recordEvent(sourcePage, payload) {
    const event = {
      nodeTime: new Date().toISOString(),
      profileSeq: profile.seq,
      profileId: profile.id,
      pageUrl: sourcePage.url(),
      ...payload,
    };
    events.push(event);
    await appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
    const targetName = event.target?.accessibleName || event.target?.text || event.target?.selector || '';
    console.log(`[${events.length}] ${event.eventType} ${targetName}`.slice(0, 220));
  }

  async function attachPage(page) {
    if (!options.includeConsolePages && page.url().startsWith('https://console.bitbrowser.net/')) return;
    const state = pageStates.get(page) || {
      bindingReady: false,
      initScriptReady: false,
      liveScriptReady: false,
      hooksReady: false,
      lastError: '',
    };
    pageStates.set(page, state);

    if (!state.bindingReady) {
      try {
        await page.exposeBinding(bindingName, async ({ page: sourcePage }, payload) => {
          await recordEvent(sourcePage, payload);
        });
        state.bindingReady = true;
      } catch (error) {
        state.lastError = `exposeBinding: ${error.message}`;
      }
    }

    if (!state.initScriptReady) {
      try {
        await page.addInitScript(script);
        state.initScriptReady = true;
      } catch (error) {
        state.lastError = `addInitScript: ${error.message}`;
      }
    }

    if (!state.liveScriptReady) {
      try {
        await page.evaluate(script);
        state.liveScriptReady = true;
      } catch (error) {
        state.lastError = `evaluate: ${error.message}`;
      }
    }

    if (!state.hooksReady) {
      state.hooksReady = true;
      page.on('domcontentloaded', () => {
        const nextState = pageStates.get(page);
        if (nextState) {
          nextState.liveScriptReady = false;
        }
        attachPage(page).catch(error => console.error(`domcontentloaded attach failed: ${error.message}`));
      });
      page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) {
          const nextState = pageStates.get(page);
          if (nextState) {
            nextState.liveScriptReady = false;
          }
          attachPage(page).catch(error => console.error(`framenavigated attach failed: ${error.message}`));
        }
      });
    }
  }

  async function attachContext(context) {
    if (!watchedContexts.has(context)) {
      watchedContexts.add(context);
      context.on('page', page => {
        attachPage(page).catch(error => console.error(`attach failed: ${error.message}`));
      });
    }
    for (const page of context.pages()) {
      await attachPage(page);
    }
  }

  async function attachAllPages() {
    for (const context of browser.contexts()) {
      await attachContext(context);
    }
  }

  await attachAllPages();
  const attachTimer = setInterval(() => {
    attachAllPages().catch(error => console.error(`attach scan failed: ${error.message}`));
  }, 1000);

  await writeFile(eventsPath, '', { flag: 'a' });
  await writeFile(summaryPath, `# BitBrowser Action Monitor

- Started: ${new Date().toISOString()}
- Profile seq: ${profile.seq}
- Profile id: ${profile.id}
- API: ${bitbrowserApi}
- CDP endpoint: ${endpoint}
- Include typed text: ${options.includeText ? 'yes' : 'no'}
- Events JSONL: ${eventsPath}

Stop this command with Ctrl+C after the screen recording is done.
`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    profileSeq: profile.seq,
    profileId: profile.id,
    outputDir: outDir,
    events: eventsPath,
    summary: summaryPath,
    includeText: options.includeText,
    stopFile: options.stopFile || null,
    message: options.durationSec
      ? `Monitoring for ${options.durationSec}s...`
      : options.stopFile
        ? `Monitoring until stop file appears: ${options.stopFile}`
        : 'Monitoring until Ctrl+C...',
  }, null, 2));

  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    const userEvents = events.filter(event => event.eventType !== 'monitor-ready');
    const readyEvents = events.filter(event => event.eventType === 'monitor-ready');
    const rows = userEvents.map(eventToMarkdown).join('\n');
    clearInterval(attachTimer);
    await writeFile(summaryPath, `# BitBrowser Action Monitor

- Stopped: ${new Date().toISOString()}
- Profile seq: ${profile.seq}
- Profile id: ${profile.id}
- API: ${bitbrowserApi}
- CDP endpoint: ${endpoint}
- Include typed text: ${options.includeText ? 'yes' : 'no'}
- Ready signal count: ${readyEvents.length}
- User event count: ${userEvents.length}
- Events JSONL: ${eventsPath}

## Events

| # | Time | Event | Page title | Tag | Target text/name | Selector hint | Detail |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows || '| | | No events captured | | | | | |'}

## Handoff Prompt

\`\`\`text
Use this action-monitor packet together with my screen recording to build a Playwright script.
Packet directory: ${outDir}
Events file: ${eventsPath}
Summary file: ${summaryPath}
Replay target: BitBrowser profile seq/id ${profile.seq}

Use selector hints from the summary when stable. If an input value is masked, infer it from the user-provided notes or ask before scripting it.
\`\`\`
`, 'utf8');
    await browser.close().catch(() => {});
    console.log(`Action monitor stopped. Summary: ${summaryPath}`);
  }

  process.on('SIGINT', async () => {
    await stop();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await stop();
    process.exit(0);
  });

  if (options.durationSec > 0) {
    await new Promise(resolve => setTimeout(resolve, options.durationSec * 1000));
    await stop();
    return;
  }

  if (options.stopFile) {
    await new Promise(resolve => {
      const timer = setInterval(() => {
        if (existsSync(options.stopFile)) {
          clearInterval(timer);
          resolve();
        }
      }, 500);
    });
    await stop();
    return;
  }

  await new Promise(() => {});
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
