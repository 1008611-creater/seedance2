import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const textOf = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const roleFor = label => /nano banana|gemini|flux|midjourney|seedream|qwen|doubao|grok|ideogram|recraft|1\.5/i.test(label) ? 'comparison' : /reference|original|input|source image|before|原图|参考|输入|existing|target product/i.test(label) ? 'reference' : 'output';
const urls = text => [...text.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']|!\[[^\]]*\]\(([^)\s]+)/gi)].map(m => m[1] || m[2]);
export function parseImageRoles(block, sourceId) {
  const mapped = new Map();
  const add = (url, label = '', role = roleFor(label)) => {
    if (!url || /badge|shields\.io|trendshift/i.test(url)) return;
    if (!/^https?:/i.test(url) && sourceId === 'zerolu') url = 'https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main/' + url.replace(/^\.?\//, '');
    if (!/^https?:/i.test(url)) return;
    mapped.set(url, { url, role, label });
  };
  for (const table of block.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    let headers = [], occupied = [];
    for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      let column = 0;
      const nextOccupied = occupied.map(n => Math.max(0, n - 1));
      for (const cell of row[1].matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
        while (occupied[column] > 0) column++;
        const colspan = Number(cell[2].match(/colspan=["']?(\d+)/i)?.[1] || 1);
        const rowspan = Number(cell[2].match(/rowspan=["']?(\d+)/i)?.[1] || 1);
        const label = textOf(cell[3]);
        if (cell[1].toLowerCase() === 'th') {
          for (let n = 0; n < colspan; n++) headers[column + n] = label;
        } else {
          const alt = cell[3].match(/alt=["']([^"']*)["']/i)?.[1] || '';
          const sub = cell[3].match(/<sub>([\s\S]*?)<\/sub>/i)?.[1] || '';
          const evidence = [headers[column], textOf(sub), alt].filter(Boolean).join(' · ');
          for (const url of urls(cell[3])) add(url, evidence);
        }
        for (let n = 0; n < colspan; n++) nextOccupied[column + n] = Math.max(nextOccupied[column + n] || 0, rowspan - 1);
        column += colspan;
      }
      occupied = nextOccupied;
    }
  }
  let mdHeaders = [];
  for (const line of block.split('\n')) {
    if (!line.trim().startsWith('|')) { mdHeaders = []; continue; }
    const cells = line.trim().replace(/^\||\|$/g, '').split('|');
    if (cells.every(c => /^\s*:?-+:?\s*$/.test(c))) continue;
    if (!urls(line).length) { mdHeaders = cells.map(textOf); continue; }
    cells.forEach((cell, i) => urls(cell).forEach(url => add(url, mdHeaders[i] || '')));
  }
  for (const url of urls(block)) {
    const resolved = !/^https?:/i.test(url) && sourceId === 'zerolu' ? 'https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main/' + url.replace(/^\.?\//, '') : url;
    if (!mapped.has(resolved)) add(url);
  }
  return [...mapped.values()];
}
export function promptFromBlock(block) {
  return block.match(/\*\*(?:Observed\s+)?Prompt:?\*\*\s*:?[\r\n]*\x60{3}(?:\w+)?\s*([\s\S]*?)\x60{3}/i)?.[1]?.trim() || '';
}
export function evoExamples(body, category, title) {
  const headings = [...body.matchAll(/^####\s+Example\s+\d+:\s*(.+)$/gm)];
  return headings.map((h, i) => ({
    title: h[1].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim(),
    body: body.slice(h.index + h[0].length, headings[i + 1]?.index ?? body.length),
    key: 'example-' + hash(category + '\n' + title + '\n' + h[1].replace(/https?:\/\/[^)]+/g, '')).slice(0, 20)
  }));
}
