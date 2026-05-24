import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

type CsvValue = string | number | boolean | null | undefined;

function stripTrailingNewline(value: string) {
  return value.replace(/\r?\n$/, '');
}

function runClipboardCommand(command: string, args: string[]) {
  return stripTrailingNewline(
    execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }),
  );
}

export async function readClipboardText() {
  if (process.platform === 'win32') {
    const script = '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); Get-Clipboard -Raw';
    return runClipboardCommand('powershell.exe', ['-NoProfile', '-Command', script]);
  }

  if (process.platform === 'darwin') {
    return runClipboardCommand('pbpaste', []);
  }

  const linuxReaders: Array<[string, string[]]> = [
    ['wl-paste', ['--no-newline']],
    ['xclip', ['-selection', 'clipboard', '-out']],
    ['xsel', ['--clipboard', '--output']],
  ];

  for (const [command, args] of linuxReaders) {
    try {
      return runClipboardCommand(command, args);
    } catch {
      // Try the next local clipboard reader.
    }
  }

  throw new Error('No supported clipboard reader was found on this system.');
}

export function escapeCsvValue(value: CsvValue) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export async function appendCsvRow(
  csvPath: string,
  values: CsvValue[],
  options: {
    header?: string[];
    dedupeValue?: string;
  } = {},
) {
  await mkdir(dirname(csvPath), { recursive: true });

  const existing = await readFile(csvPath, 'utf8').catch(() => '');
  if (options.dedupeValue && existing.includes(options.dedupeValue)) {
    return false;
  }

  const header = options.header?.map(escapeCsvValue).join(',') ?? '';
  const row = values.map(escapeCsvValue).join(',');
  const prefix = existing.trim().length > 0 ? existing.trimEnd() : header;
  const next = prefix.length > 0 ? `${prefix}\n${row}\n` : `${row}\n`;

  await writeFile(csvPath, next, 'utf8');
  return true;
}
