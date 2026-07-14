import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);

function usage() {
  console.log(`Usage:
  npm run pw:video-intake -- "D:\\path\\screen-recording.mp4" [options]

Options:
  --name <slug>        Output folder/script name. Default: video file name
  --url <url>          Target start URL for the future Playwright script
  --interval <sec>     Seconds between extracted frames. Default: 2
  --max-frames <n>     Maximum frames to extract. Default: 80
  --output-root <path> Directory for recording packets. Default: output/playwright/video-intake
  --notes <text>       Extra operator notes to include in the review packet

Environment:
  FFMPEG_PATH          Optional path to ffmpeg.exe
  FFPROBE_PATH         Optional path to ffprobe.exe`);
}

function parseArgs(values) {
  const options = {
    videoPath: '',
    name: '',
    url: '',
    interval: 2,
    maxFrames: 80,
    outputRoot: path.join(root, 'output', 'playwright', 'video-intake'),
    notes: '',
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--help' || value === '-h') {
      options.help = true;
    } else if (value === '--name') {
      options.name = values[++index] || '';
    } else if (value === '--url') {
      options.url = values[++index] || '';
    } else if (value === '--interval') {
      options.interval = Number(values[++index] || options.interval);
    } else if (value === '--max-frames') {
      options.maxFrames = Number(values[++index] || options.maxFrames);
    } else if (value === '--output-root') {
      options.outputRoot = values[++index] || options.outputRoot;
    } else if (value === '--notes') {
      options.notes = values[++index] || '';
    } else if (!options.videoPath) {
      options.videoPath = value;
    } else {
      throw new Error(`Unexpected argument: ${value}`);
    }
  }

  if (!Number.isFinite(options.interval) || options.interval <= 0) {
    throw new Error('--interval must be a positive number.');
  }
  if (!Number.isFinite(options.maxFrames) || options.maxFrames < 1) {
    throw new Error('--max-frames must be a positive number.');
  }
  options.outputRoot = path.resolve(root, options.outputRoot);

  return options;
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'screen-recording';
}

function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where.exe' : 'command';
  const checkerArgs = process.platform === 'win32' ? [command] : ['-v', command];
  const result = spawnSync(checker, checkerArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0) {
    return '';
  }
  return result.stdout.split(/\r?\n/).find(Boolean)?.trim() || command;
}

function resolveTool(envName, binaryName) {
  const explicit = process.env[envName];
  if (explicit && existsSync(explicit)) {
    return explicit;
  }
  return commandExists(binaryName);
}

function runTool(command, argsList) {
  return spawnSync(command, argsList, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

async function probeVideo(ffprobe, videoPath) {
  if (!ffprobe) {
    return { available: false };
  }

  const result = runTool(ffprobe, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'format=duration:stream=width,height,avg_frame_rate',
    '-of',
    'json',
    videoPath,
  ]);

  if (result.status !== 0) {
    return {
      available: true,
      error: result.stderr.trim() || result.stdout.trim() || 'ffprobe failed.',
    };
  }

  try {
    const payload = JSON.parse(result.stdout);
    const stream = payload.streams?.[0] || {};
    return {
      available: true,
      durationSec: Number(payload.format?.duration || 0),
      width: stream.width,
      height: stream.height,
      frameRate: stream.avg_frame_rate,
    };
  } catch (error) {
    return { available: true, error: `Could not parse ffprobe output: ${error.message}` };
  }
}

async function extractFrames(ffmpeg, videoPath, framesDir, options) {
  if (!ffmpeg) {
    return { available: false, frames: [] };
  }

  await mkdir(framesDir, { recursive: true });
  const outputPattern = path.join(framesDir, 'frame-%04d.jpg');
  const result = runTool(ffmpeg, [
    '-y',
    '-i',
    videoPath,
    '-vf',
    `fps=1/${options.interval},scale=1280:-1`,
    '-frames:v',
    String(options.maxFrames),
    '-q:v',
    '3',
    outputPattern,
  ]);

  if (result.status !== 0) {
    return {
      available: true,
      error: result.stderr.trim() || result.stdout.trim() || 'ffmpeg failed.',
      frames: [],
    };
  }

  const frames = (await readdir(framesDir))
    .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
    .sort()
    .map(file => path.join(framesDir, file));

  return { available: true, frames };
}

function toPosixRelative(fullPath) {
  return path.relative(root, fullPath).replace(/\\/g, '/');
}

function makeDraftSpec(options) {
  const startUrl = options.url || 'https://example.com/';
  return `import { expect, test } from '@playwright/test';

test('${options.name}: recorded from screen video', async ({ page }) => {
  await page.goto(${JSON.stringify(startUrl)}, { waitUntil: 'domcontentloaded' });

  // TODO: Replace this skeleton with actions reconstructed from the recording packet.
  // Preferred selectors:
  // - getByRole for buttons, links, menus, tabs, textboxes
  // - getByLabel for form controls
  // - locator('[data-testid="..."]') when the app exposes stable ids
  // After drafting, save the finished script under tests/saved-flows/
  // and run it through BitBrowser with tools/run-saved-flow-in-bitbrowser.mjs.

  await expect(page).toHaveURL(/./);
});
`;
}

function makeReviewMarkdown({
  videoPath,
  videoSize,
  outDir,
  frames,
  probe,
  ffmpeg,
  ffprobe,
  options,
  draftPath,
}) {
  const frameList = frames.length
    ? frames.map((frame, index) => `- ${index + 1}. [${path.basename(frame)}](${toPosixRelative(frame)})`).join('\n')
    : '- No frames extracted. Install ffmpeg or set FFMPEG_PATH, then rerun the intake command.';

  const duration = Number.isFinite(probe.durationSec) && probe.durationSec > 0
    ? `${probe.durationSec.toFixed(2)}s`
    : 'unknown';

  return `# Playwright Video Intake: ${options.name}

## Source

- Video: ${videoPath}
- Size: ${videoSize} bytes
- Start URL hint: ${options.url || '(not provided)'}
- Duration: ${duration}
- Dimensions: ${probe.width && probe.height ? `${probe.width}x${probe.height}` : 'unknown'}
- Frame interval: ${options.interval}s
- Frame limit: ${options.maxFrames}
- ffmpeg: ${ffmpeg || 'not found'}
- ffprobe: ${ffprobe || 'not found'}
- Draft spec: [${toPosixRelative(draftPath)}](${toPosixRelative(draftPath)})

## Operator Notes

${options.notes || '(none)'}

## Reconstruction Checklist

- [ ] Identify the browser/profile used in the recording.
- [ ] Confirm the start URL and whether login/session state is already present in BitBrowser.
- [ ] Convert every visible click/type/upload/navigation into Playwright actions.
- [ ] Prefer stable role/label/text selectors over coordinates.
- [ ] Mark any unclear step with a timestamp and screenshot reference.
- [ ] Run the final script with \`node tools/run-saved-flow-in-bitbrowser.mjs <script> <seq>\`.
- [ ] Capture final screenshot in \`output/playwright/\`.

## Frames

${frameList}

## Draft Action Log

Use this table while reviewing the frames/video:

| Time | Observation | Playwright action | Confidence |
| --- | --- | --- | --- |
| 00:00 | Start page loaded | \`await page.goto(...)\` | medium |

## Codex Handoff Prompt

\`\`\`text
Build a runnable Playwright script from this screen-recording intake packet:
- Packet directory: ${outDir}
- Source video: ${videoPath}
- Start URL: ${options.url || 'infer from video or ask me to confirm'}
- Suggested output script: tests/saved-flows/${options.name}.spec.ts
- Replay target: BitBrowser via tools/run-saved-flow-in-bitbrowser.mjs

Requirements:
1. Read review.md and the frames directory first.
2. Use stable selectors; avoid coordinates unless the page has no usable DOM semantics.
3. If the video includes login, CAPTCHA, payment, publishing, or other high-risk actions, stop before the final confirmation.
4. Verify the finished script with a real running BitBrowser window or mock CDP.
\`\`\`
`;
}

async function main() {
  const options = parseArgs(args);
  if (options.help) {
    usage();
    return;
  }
  if (!options.videoPath) {
    usage();
    process.exitCode = 1;
    return;
  }

  const videoPath = path.resolve(root, options.videoPath);
  if (!existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const videoStat = await stat(videoPath);
  if (!videoStat.isFile()) {
    throw new Error(`Video path is not a file: ${videoPath}`);
  }

  options.name = slugify(options.name || path.basename(videoPath, path.extname(videoPath)));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(options.outputRoot, `${options.name}-${stamp}`);
  const framesDir = path.join(outDir, 'frames');
  await mkdir(outDir, { recursive: true });

  const ffmpeg = resolveTool('FFMPEG_PATH', 'ffmpeg');
  const ffprobe = resolveTool('FFPROBE_PATH', 'ffprobe');
  const probe = await probeVideo(ffprobe, videoPath);
  const extraction = await extractFrames(ffmpeg, videoPath, framesDir, options);

  const draftPath = path.join(outDir, 'draft-playwright.spec.ts');
  await writeFile(draftPath, makeDraftSpec(options), 'utf8');

  const manifest = {
    createdAt: new Date().toISOString(),
    videoPath,
    outputDir: outDir,
    options,
    tools: { ffmpeg: ffmpeg || null, ffprobe: ffprobe || null },
    probe,
    extraction: {
      available: extraction.available,
      error: extraction.error || null,
      frames: extraction.frames.map(frame => toPosixRelative(frame)),
    },
    draftSpec: toPosixRelative(draftPath),
  };

  const manifestPath = path.join(outDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  const reviewPath = path.join(outDir, 'review.md');
  await writeFile(
    reviewPath,
    makeReviewMarkdown({
      videoPath,
      videoSize: videoStat.size,
      outDir,
      frames: extraction.frames,
      probe,
      ffmpeg,
      ffprobe,
      options,
      draftPath,
    }),
    'utf8',
  );

  console.log(JSON.stringify({
    ok: true,
    outputDir: outDir,
    review: reviewPath,
    manifest: manifestPath,
    draftSpec: draftPath,
    frames: extraction.frames.length,
    warnings: [
      ffmpeg ? null : 'ffmpeg not found; frames were not extracted.',
      ffprobe ? null : 'ffprobe not found; video metadata was not probed.',
      extraction.error ? `frame extraction failed: ${extraction.error}` : null,
      probe.error ? `metadata probe failed: ${probe.error}` : null,
    ].filter(Boolean),
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
