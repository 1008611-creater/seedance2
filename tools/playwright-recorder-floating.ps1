param(
  [switch]$SmokeTest,
  [switch]$StartInBall
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$defaultOutput = "tests\recorded-flow.spec.ts"
$savedDir = Join-Path $root "tests\saved-flows"
$recordingPackageRoot = Join-Path ([Environment]::GetFolderPath("MyPictures")) (([string][char]0x811a + [string][char]0x672c) + "\" + ([string][char]0x5f55 + [string][char]0x5c4f + [string][char]0x5305))
$activeMonitorProcess = $null
$activeMonitorStopFile = $null
$activeMonitorName = $null
$activeMonitorStartedAt = $null
$activeMonitorAppendTarget = $null
$normalLocation = $null
$monitorFinishTimer = $null
$monitorLaunchOut = $null
$monitorLaunchErr = $null
$allowExit = $false
$isBallMode = $false
$lastFullLocation = $null
$ballMouseDownPoint = $null
$ballDragMoved = $false

function Quote-Pwsh {
  param([Parameter(Mandatory = $true)][string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

function Start-RepoCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string]$Title,
    [switch]$KeepOpen
  )

  $fullCommand = "Set-Location -LiteralPath $(Quote-Pwsh $root); `$Host.UI.RawUI.WindowTitle = $(Quote-Pwsh $Title); $Command"
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $fullCommand
  )

  if ($KeepOpen) {
    $args = @("-NoExit") + $args
  }

  Start-Process -FilePath "powershell.exe" -ArgumentList $args
}

function Start-RepoHiddenCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string]$OutFile = "",
    [string]$ErrFile = ""
  )

  $fullCommand = "Set-Location -LiteralPath $(Quote-Pwsh $root); $Command"
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $fullCommand
  )

  $startInfo = @{
    FilePath = "powershell.exe"
    ArgumentList = $args
    WindowStyle = "Hidden"
    PassThru = $true
  }
  if (-not [string]::IsNullOrWhiteSpace($OutFile)) {
    $startInfo.RedirectStandardOutput = $OutFile
  }
  if (-not [string]::IsNullOrWhiteSpace($ErrFile)) {
    $startInfo.RedirectStandardError = $ErrFile
  }

  return Start-Process @startInfo
}

function U {
  param([Parameter(Mandatory = $true)][string]$Value)
  return [regex]::Replace($Value, '\\u([0-9a-fA-F]{4})', {
    param($Match)
    return [string][char][Convert]::ToInt32($Match.Groups[1].Value, 16)
  })
}

if ($SmokeTest) {
  Write-Output "OK: flow studio script loaded"
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class FloatingBallNative {
  [DllImport("user32.dll")]
  public static extern bool ReleaseCapture();

  [DllImport("user32.dll")]
  public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
}
"@

[System.Windows.Forms.Application]::EnableVisualStyles()

$fontName = "Microsoft YaHei UI"
$scriptMap = @{}
$profileMap = @{}
$selectedScriptRelative = ""

function New-UiSize {
  param([int]$Width, [int]$Height)
  return New-Object System.Drawing.Size -ArgumentList $Width, $Height
}

function New-UiPoint {
  param([int]$X, [int]$Y)
  return New-Object System.Drawing.Point -ArgumentList $X, $Y
}

function New-UiFont {
  param(
    [float]$Size,
    [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
  )
  return New-Object System.Drawing.Font -ArgumentList $fontName, $Size, $Style
}

function New-UiColor {
  param([int]$R, [int]$G, [int]$B)
  return [System.Drawing.Color]::FromArgb($R, $G, $B)
}

function Add-Label {
  param(
    [System.Windows.Forms.Control]$Parent,
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [float]$Size = 9,
    [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular,
    [System.Drawing.Color]$Color = (New-UiColor 71 85 105)
  )
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Location = New-UiPoint $X $Y
  $label.Size = New-UiSize $Width $Height
  $label.Font = New-UiFont $Size $Style
  $label.ForeColor = $Color
  $Parent.Controls.Add($label)
  return $label
}

function Style-Button {
  param(
    [System.Windows.Forms.Button]$Button,
    [bool]$Primary = $false,
    [bool]$Danger = $false
  )
  $Button.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
  $Button.UseVisualStyleBackColor = $false
  $Button.FlatAppearance.BorderSize = 1
  $Button.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
  $Button.Cursor = [System.Windows.Forms.Cursors]::Hand
  if ($Primary) {
    $Button.BackColor = New-UiColor 37 99 235
    $Button.ForeColor = [System.Drawing.Color]::White
    $Button.FlatAppearance.BorderColor = New-UiColor 37 99 235
  } elseif ($Danger) {
    $Button.BackColor = New-UiColor 254 242 242
    $Button.ForeColor = New-UiColor 153 27 27
    $Button.FlatAppearance.BorderColor = New-UiColor 252 165 165
  } else {
    $Button.BackColor = New-UiColor 248 250 252
    $Button.ForeColor = New-UiColor 15 23 42
    $Button.FlatAppearance.BorderColor = New-UiColor 203 213 225
  }
}

function Add-Button {
  param(
    [System.Windows.Forms.Control]$Parent,
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [bool]$Primary = $false,
    [bool]$Danger = $false
  )
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-UiPoint $X $Y
  $button.Size = New-UiSize $Width $Height
  $button.Font = New-UiFont 9.5
  Style-Button $button $Primary $Danger
  $Parent.Controls.Add($button)
  return $button
}

function Set-CircularFormRegion {
  param([int]$Diameter)

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(0, 0, $Diameter, $Diameter)
  $form.Region = New-Object System.Drawing.Region($path)
}

function Snap-BallToEdge {
  if (-not $script:isBallMode) {
    return
  }

  $screen = [System.Windows.Forms.Screen]::FromPoint($form.Location).WorkingArea
  $midX = $screen.Left + [int](($screen.Width) / 2)
  $targetX = if (($form.Left + [int]($form.Width / 2)) -lt $midX) {
    $screen.Left + 8
  } else {
    $screen.Right - $form.Width - 8
  }
  $targetY = [Math]::Min([Math]::Max($form.Top, $screen.Top + 8), $screen.Bottom - $form.Height - 8)
  $form.Location = New-UiPoint $targetX $targetY
}

function Start-BallNativeDrag {
  $script:ballDragMoved = $true
  [void][FloatingBallNative]::ReleaseCapture()
  [void][FloatingBallNative]::SendMessage($form.Handle, 0xA1, [IntPtr]2, [IntPtr]::Zero)
  Snap-BallToEdge
}

function To-RelativePath {
  param([string]$FullPath)
  $base = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\') + '\'
  $full = (Resolve-Path -LiteralPath $FullPath).Path
  if ($full.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($base.Length).Replace('/', '\')
  }
  return $full.Replace('/', '\')
}

function Test-RecordedScript {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return $false
  }
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -lt 150) {
    return $false
  }
  $content = Get-Content -LiteralPath $Path -Raw
  return $content -match 'await\s+page\.'
}

function Escape-CsvValue {
  param([AllowNull()][object]$Value)
  return '"' + ([string]$Value).Replace('"', '""') + '"'
}

function Get-LocalClipboardText {
  if ([System.Windows.Forms.Clipboard]::ContainsText()) {
    return [System.Windows.Forms.Clipboard]::GetText()
  }

  try {
    return Get-Clipboard -Raw
  } catch {
    throw (U "\u526a\u8d34\u677f\u91cc\u6ca1\u6709\u53ef\u8bfb\u53d6\u7684\u6587\u672c\u5185\u5bb9\u3002")
  }
}

function Append-CsvRow {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$Header,
    [Parameter(Mandatory = $true)][object[]]$Values
  )

  $directory = Split-Path -Parent $Path
  if ($directory -and -not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }

  $encoding = New-Object System.Text.UTF8Encoding -ArgumentList $false
  if (-not (Test-Path $Path)) {
    $headerLine = ($Header | ForEach-Object { Escape-CsvValue $_ }) -join ","
    [System.IO.File]::AppendAllText($Path, $headerLine + [Environment]::NewLine, $encoding)
  }

  $row = ($Values | ForEach-Object { Escape-CsvValue $_ }) -join ","
  [System.IO.File]::AppendAllText($Path, $row + [Environment]::NewLine, $encoding)
}

function Save-CurrentClipboardToCsv {
  $text = Get-LocalClipboardText
  if ([string]::IsNullOrWhiteSpace($text)) {
    throw (U "\u526a\u8d34\u677f\u91cc\u6ca1\u6709\u53ef\u4fdd\u5b58\u7684\u6587\u672c\u3002")
  }

  $target = Join-Path $root "output\clipboard\clipboard-captures.csv"
  Append-CsvRow -Path $target -Header @("savedAt", "source", "clipboardText") -Values @((Get-Date).ToString("o"), "floating-tool", $text)
  return $target
}

function Get-RecordUrls {
  $urls = @()
  foreach ($line in ($urlBox.Text -split "\r?\n")) {
    $value = $line.Trim()
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      $urls += $value
    }
  }
  return $urls
}

function ConvertTo-FileUrl {
  param([Parameter(Mandatory = $true)][string]$Path)
  return ([System.Uri](Resolve-Path -LiteralPath $Path).Path).AbsoluteUri
}

function Escape-Html {
  param([AllowNull()][object]$Value)
  return [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

function New-RecordingNavigator {
  param([Parameter(Mandatory = $true)][string[]]$Urls)

  $navigatorPath = Join-Path $root "output\playwright\recording-navigator.html"
  $navigatorDir = Split-Path -Parent $navigatorPath
  if (-not (Test-Path $navigatorDir)) {
    New-Item -ItemType Directory -Path $navigatorDir | Out-Null
  }

  $items = New-Object System.Text.StringBuilder
  $urlLabel = U "\u7f51\u5740"
  $sameTabLabel = U "\u540c\u6807\u7b7e\u6253\u5f00"
  $newTabLabel = U "\u65b0\u6807\u7b7e\u6253\u5f00"
  $title = U "\u591a\u7f51\u5740\u5f55\u5236\u5bfc\u822a"
  $description = U "\u5f55\u5236\u5668\u4f1a\u4ece\u8fd9\u91cc\u5f00\u59cb\u3002\u9700\u8981\u4fdd\u7559\u591a\u4e2a\u9875\u9762\u65f6\u70b9\u201c\u65b0\u6807\u7b7e\u6253\u5f00\u201d\uff1b\u9700\u8981\u540c\u4e00\u4e2a\u9875\u9762\u8fde\u7eed\u8df3\u8f6c\u65f6\u70b9\u201c\u540c\u6807\u7b7e\u6253\u5f00\u201d\u3002"
  for ($i = 0; $i -lt $Urls.Count; $i += 1) {
    $number = $i + 1
    $encodedUrl = Escape-Html $Urls[$i]
    [void]$items.AppendLine("<section class=""target"">")
    [void]$items.AppendLine("  <div class=""meta"">$urlLabel $number</div>")
    [void]$items.AppendLine("  <code>$encodedUrl</code>")
    [void]$items.AppendLine("  <div class=""actions"">")
    [void]$items.AppendLine("    <a class=""primary"" href=""$encodedUrl"">$sameTabLabel $number</a>")
    [void]$items.AppendLine("    <a href=""$encodedUrl"" target=""_blank"">$newTabLabel $number</a>")
    [void]$items.AppendLine("  </div>")
    [void]$items.AppendLine("</section>")
  }

  $html = @"
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>$title</title>
  <style>
    :root { color-scheme: light; font-family: "Microsoft YaHei UI", Arial, sans-serif; }
    body { margin: 0; background: #f8fafc; color: #0f172a; }
    main { max-width: 980px; margin: 0 auto; padding: 32px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    p { margin: 0 0 24px; color: #475569; }
    .target { background: #fff; border: 1px solid #dbe3ef; padding: 18px; margin-bottom: 14px; }
    .meta { font-weight: 700; margin-bottom: 8px; color: #1d4ed8; }
    code { display: block; padding: 10px 12px; background: #f1f5f9; overflow-wrap: anywhere; }
    .actions { display: flex; gap: 10px; margin-top: 14px; }
    a { display: inline-flex; align-items: center; justify-content: center; height: 36px; padding: 0 14px; border: 1px solid #cbd5e1; color: #0f172a; text-decoration: none; }
    a.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
  </style>
</head>
<body>
  <main>
    <h1>$title</h1>
    <p>$description</p>
    $items
  </main>
</body>
</html>
"@

  $encoding = New-Object System.Text.UTF8Encoding -ArgumentList $false
  [System.IO.File]::WriteAllText($navigatorPath, $html, $encoding)
  return $navigatorPath
}

function Write-TemplateScript {
  param(
    [Parameter(Mandatory = $true)][string]$FileName,
    [Parameter(Mandatory = $true)][string]$Content
  )

  if (-not (Test-Path $savedDir)) {
    New-Item -ItemType Directory -Path $savedDir | Out-Null
  }

  $target = Join-Path $savedDir $FileName
  if (Test-Path $target) {
    $confirm = [System.Windows.Forms.MessageBox]::Show((U "\u8fd9\u4e2a\u6a21\u677f\u5df2\u5b58\u5728\uff0c\u8981\u8986\u76d6\u5417\uff1f"), (U "\u8986\u76d6\u6a21\u677f"), [System.Windows.Forms.MessageBoxButtons]::YesNo)
    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) {
      return $null
    }
  }

  Set-Content -LiteralPath $target -Value $Content -Encoding UTF8
  return $target
}

function Get-ScriptEntries {
  $entries = @()
  $recordedPath = Join-Path $root $defaultOutput
  if (Test-Path $recordedPath) {
    $item = Get-Item -LiteralPath $recordedPath
    $entries += [pscustomobject]@{
      Relative = To-RelativePath $item.FullName
      FullName = $item.FullName
      Length = $item.Length
      LastWriteTime = $item.LastWriteTime
      IsSaved = $false
    }
  }
  if (Test-Path $savedDir) {
    foreach ($item in (Get-ChildItem -LiteralPath $savedDir -Filter "*.spec.ts" | Sort-Object LastWriteTime -Descending)) {
      $entries += [pscustomobject]@{
        Relative = To-RelativePath $item.FullName
        FullName = $item.FullName
        Length = $item.Length
        LastWriteTime = $item.LastWriteTime
        IsSaved = $true
      }
    }
  }
  return $entries
}

function Get-SavedScriptEntries {
  return @(Get-ScriptEntries | Where-Object { $_.IsSaved })
}

function Get-ScriptDisplayText {
  param([Parameter(Mandatory = $true)]$Entry)
  return "{0}  |  {1} bytes  |  {2}" -f $Entry.Relative, $Entry.Length, $Entry.LastWriteTime.ToString("MM-dd HH:mm")
}

function Get-DefaultSelectedScriptRelative {
  param([Parameter(Mandatory = $true)]$Entries)
  foreach ($entry in $Entries) {
    if ($entry.IsSaved) {
      return $entry.Relative
    }
  }
  if ($Entries.Count -gt 0) {
    return $Entries[0].Relative
  }
  return ""
}

function Get-NormalizedScriptFileName {
  param([string]$Value)

  $name = $Value.Trim()
  $name = [regex]::Replace($name, '\.spec\.ts$', '', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $name = [regex]::Replace($name, '[^\w\-.]+', '-').Trim('-')
  if ([string]::IsNullOrWhiteSpace($name)) {
    return ""
  }
  return $name + ".spec.ts"
}

function Get-ScriptSlugFromRelativePath {
  param([string]$RelativePath)

  $leaf = Split-Path $RelativePath -Leaf
  $leaf = [regex]::Replace($leaf, '\.spec\.ts$', '', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $leaf = [regex]::Replace($leaf, '[^\w\-.]+', '-').Trim('-')
  if ([string]::IsNullOrWhiteSpace($leaf)) {
    return "flow"
  }
  return $leaf
}

function Write-Utf8File {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $directory = Split-Path -Parent $Path
  if ($directory -and -not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $encoding = New-Object System.Text.UTF8Encoding -ArgumentList $false
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Add-AppendTargetToPackage {
  param(
    [Parameter(Mandatory = $true)]$Package,
    [string]$RelativePath
  )

  if ([string]::IsNullOrWhiteSpace($RelativePath)) {
    return
  }

  $targetPath = Join-Path $root $RelativePath
  $targetExists = Test-Path $targetPath
  $copiedScriptName = ""
  if ($targetExists) {
    $copiedScriptName = "append-target.spec.ts"
    Copy-Item -LiteralPath $targetPath -Destination (Join-Path $Package.FullName $copiedScriptName) -Force
  }
  if ($copiedScriptName) {
    $baseScriptCopyText = $copiedScriptName
    $copiedScriptValue = $copiedScriptName
  } else {
    $baseScriptCopyText = 'not available'
    $copiedScriptValue = $null
  }

  $manifest = [ordered]@{
    mode = "append"
    targetScriptRelative = $RelativePath
    targetScriptExists = $targetExists
    copiedScript = $copiedScriptValue
    createdAt = (Get-Date).ToString("o")
  }
  Write-Utf8File -Path (Join-Path $Package.FullName "append-target.json") -Content (($manifest | ConvertTo-Json -Depth 4) + [Environment]::NewLine)

  $summaryPath = Join-Path $Package.FullName "summary.md"
  $appendSection = @"

## Append Target

- Mode: append to existing script
- Target script: $RelativePath
- Target script exists: $targetExists
- Base script copy: $baseScriptCopyText

## Codex Append Prompt

```text
Append the new monitored actions in this package to the end of the existing Playwright script.
- Existing script: $RelativePath
- Package directory: $($Package.FullName)
- Base script copy: $baseScriptCopyText

Requirements:
1. Read summary.md and events.jsonl first.
2. Preserve the existing login/session assumptions already present in the base script.
3. Append only the new tail actions after the last completed step.
4. Keep selectors stable and avoid coordinates unless there is no usable DOM target.
```

"@

  if (Test-Path $summaryPath) {
    $existing = Get-Content -LiteralPath $summaryPath -Raw
    if ($existing -notmatch '## Append Target') {
      $updatedSummary = $existing.TrimEnd() + [Environment]::NewLine + $appendSection
      Write-Utf8File -Path $summaryPath -Content $updatedSummary
    }
  } else {
    $newSummary = "# Recording Summary" + [Environment]::NewLine + $appendSection
    Write-Utf8File -Path $summaryPath -Content $newSummary
  }
}

function Get-SameTabTemplate {
  return @'
import { test, expect } from '@playwright/test';
import { appendCsvRow } from '../helpers/local-automation';

test('template: same tab multi url', async ({ page }) => {
  await page.goto('https://example.com/');
  await expect(page).toHaveURL(/example\.com/);
  const firstTitle = await page.title();

  await page.goto('https://example.org/');
  await expect(page).toHaveURL(/example\.org/);
  const secondTitle = await page.title();

  await appendCsvRow('output/multi-url/same-tab.csv', [new Date().toISOString(), firstTitle, secondTitle], {
    header: ['savedAt', 'firstTitle', 'secondTitle'],
  });
});
'@
}

function Get-MultiTabsTemplate {
  return @'
import { test, expect } from '@playwright/test';
import { appendCsvRow } from '../helpers/local-automation';

test('template: multiple tabs', async ({ page }) => {
  const pageA = page;
  await pageA.goto('https://example.com/');
  await expect(pageA).toHaveURL(/example\.com/);

  const pageB = await page.context().newPage();
  await pageB.goto('https://example.org/');
  await expect(pageB).toHaveURL(/example\.org/);

  const valueFromA = await pageA.title();

  await pageB.bringToFront();
  const valueFromB = await pageB.title();

  await appendCsvRow('output/multi-url/multi-tabs.csv', [new Date().toISOString(), valueFromA, valueFromB], {
    header: ['savedAt', 'valueFromA', 'valueFromB'],
  });
});
'@
}

function Get-PopupTemplate {
  return @'
import { test, expect } from '@playwright/test';
import { appendCsvRow } from '../helpers/local-automation';

test('template: popup or new window', async ({ page }) => {
  await page.setContent(`
    <a href="https://example.org/" target="_blank">Open target page</a>
  `);

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open target page' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup).toHaveURL(/example\.org/);

  await appendCsvRow('output/multi-url/popup-window.csv', [new Date().toISOString(), await popup.title()], {
    header: ['savedAt', 'popupTitle'],
  });
});
'@
}

function Get-ClipboardTemplate {
  return @'
import { test, expect } from '@playwright/test';
import { appendCsvRow, readClipboardText } from '../helpers/local-automation';

test('template: read clipboard to csv', async ({ page }) => {
  await page.goto('https://example.com/');
  await expect(page).toHaveURL(/example\.com/);

  const clipboardText = await readClipboardText();
  await appendCsvRow('output/clipboard/clipboard-captures.csv', [new Date().toISOString(), page.url(), clipboardText], {
    header: ['savedAt', 'url', 'clipboardText'],
  });
});
'@
}

if (-not (Test-Path $savedDir)) {
  New-Item -ItemType Directory -Path $savedDir | Out-Null
}

$form = New-Object System.Windows.Forms.Form
$form.Text = U "\u811a\u672c\u6d41\u7a0b\u5de5\u4f5c\u53f0"
$form.TopMost = $true
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.ClientSize = New-UiSize 820 858
$form.BackColor = New-UiColor 241 245 249
$form.Font = New-UiFont 9
$form.Opacity = 0.99

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-UiPoint ($screen.Right - $form.Width - 18) ($screen.Bottom - $form.Height - 18)

$header = New-Object System.Windows.Forms.Panel
$header.Location = New-UiPoint 0 0
$header.Size = New-UiSize 820 78
$header.BackColor = New-UiColor 15 23 42
$form.Controls.Add($header)

Add-Label $header (U "Playwright \u811a\u672c\u6d41\u7a0b\u5de5\u4f5c\u53f0") 22 14 360 28 13 ([System.Drawing.FontStyle]::Bold) ([System.Drawing.Color]::White) | Out-Null
Add-Label $header (U "\u5148\u5f55\u5236\uff0c\u518d\u4fdd\u5b58\u5230\u811a\u672c\u5e93\uff0c\u6700\u540e\u5e94\u7528\u5230\u6307\u5b9a\u6bd4\u7279\u6d4f\u89c8\u5668\u7a97\u53e3\u3002") 22 44 640 20 9 ([System.Drawing.FontStyle]::Regular) (New-UiColor 203 213 225) | Out-Null

$pin = New-Object System.Windows.Forms.CheckBox
$pin.Text = U "\u7f6e\u9876"
$pin.Checked = $true
$pin.Location = New-UiPoint 744 18
$pin.Size = New-UiSize 62 24
$pin.Font = New-UiFont 9
$pin.ForeColor = [System.Drawing.Color]::White
$pin.BackColor = New-UiColor 15 23 42
$pin.Add_CheckedChanged({ $form.TopMost = $pin.Checked })
$header.Controls.Add($pin)

$modeButton = Add-Button $header (U "\u9ad8\u7ea7\u529f\u80fd") 580 38 138 30
$modeButton.Font = New-UiFont 9.5 ([System.Drawing.FontStyle]::Bold)
$modeButton.BackColor = New-UiColor 30 41 59
$modeButton.ForeColor = [System.Drawing.Color]::White
$modeButton.FlatAppearance.BorderColor = New-UiColor 100 116 139
$modeButton.FlatAppearance.MouseOverBackColor = New-UiColor 51 65 85
$modeButton.FlatAppearance.MouseDownBackColor = New-UiColor 30 41 59

$toolTip = New-Object System.Windows.Forms.ToolTip
$toolTip.AutoPopDelay = 4000
$toolTip.InitialDelay = 300
$toolTip.ReshowDelay = 200

$floatingPanel = New-Object System.Windows.Forms.Panel
$floatingPanel.Location = New-UiPoint 0 0
$floatingPanel.Size = New-UiSize 280 88
$floatingPanel.BackColor = New-UiColor 15 23 42
$floatingPanel.Visible = $false
$form.Controls.Add($floatingPanel)
$floatingPanel.BringToFront()

$floatingTitle = Add-Label $floatingPanel (U "\u5f55\u5c4f\u4e2d") 16 10 160 24 12 ([System.Drawing.FontStyle]::Bold) ([System.Drawing.Color]::White)
$floatingHint = Add-Label $floatingPanel (U "\u9f20\u6807\u79fb\u5165\u663e\u793a\u7ed3\u675f\u6309\u94ae") 16 34 210 18 8.5 ([System.Drawing.FontStyle]::Regular) (New-UiColor 203 213 225)
$stopRecordingButton = Add-Button $floatingPanel (U "\u7ed3\u675f\u5f55\u5c4f") 158 50 104 28 $true
$stopRecordingButton.Visible = $false

$floatingPanel.Add_MouseEnter({
  $stopRecordingButton.Visible = $true
  $floatingHint.Text = U "\u70b9\u51fb\u7ed3\u675f\u5f55\u5c4f\u5e76\u751f\u6210\u5f55\u5c4f\u5305"
})
$floatingTitle.Add_MouseEnter({ $stopRecordingButton.Visible = $true })
$floatingHint.Add_MouseEnter({ $stopRecordingButton.Visible = $true })
$stopRecordingButton.Add_MouseEnter({ $stopRecordingButton.Visible = $true })
$stopRecordingButton.Add_Click({ Stop-ActionMonitor })

$ballPanel = New-Object System.Windows.Forms.Panel
$ballPanel.Location = New-UiPoint 0 0
$ballPanel.Size = New-UiSize 72 72
$ballPanel.BackColor = New-UiColor 37 99 235
$ballPanel.Visible = $false
$ballPanel.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($ballPanel)
$ballPanel.BringToFront()

$ballAccent = New-Object System.Windows.Forms.Panel
$ballAccent.Location = New-UiPoint 8 8
$ballAccent.Size = New-UiSize 14 14
$ballAccent.BackColor = New-UiColor 191 219 254
$ballPanel.Controls.Add($ballAccent)

$ballTitle = Add-Label $ballPanel "PW" 18 20 40 18 14 ([System.Drawing.FontStyle]::Bold) ([System.Drawing.Color]::White)
$ballSubtitle = Add-Label $ballPanel (U "\u811a\u672c") 14 40 46 16 8 ([System.Drawing.FontStyle]::Regular) (New-UiColor 219 234 254)

$ballMenu = New-Object System.Windows.Forms.ContextMenuStrip
$ballOpenMenuItem = $ballMenu.Items.Add((U "\u6253\u5f00\u5de5\u4f5c\u53f0"))
$ballExitMenuItem = $ballMenu.Items.Add((U "\u9000\u51fa\u60ac\u6d6e\u7403"))
$ballPanel.ContextMenuStrip = $ballMenu
foreach ($control in @($ballAccent, $ballTitle, $ballSubtitle)) {
  $control.ContextMenuStrip = $ballMenu
}
$toolTip.SetToolTip($ballPanel, (U "\u5355\u51fb\u6253\u5f00\u5de5\u4f5c\u53f0\uff0c\u53f3\u952e\u9000\u51fa"))
$toolTip.SetToolTip($ballTitle, (U "\u5355\u51fb\u6253\u5f00\u5de5\u4f5c\u53f0"))
$toolTip.SetToolTip($ballSubtitle, (U "\u5355\u51fb\u6253\u5f00\u5de5\u4f5c\u53f0"))

$mainPanel = New-Object System.Windows.Forms.Panel
$mainPanel.Location = New-UiPoint 14 92
$mainPanel.Size = New-UiSize 386 436
$mainPanel.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($mainPanel)

Add-Label $mainPanel (U "\u63a8\u8350\u4e3b\u6d41\u7a0b") 18 14 160 24 11.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
Add-Label $mainPanel (U "\u53ea\u9700\u8981\u987a\u7740 1-2-3 \u505a\u3002\u811a\u672c\u7531 Codex \u6839\u636e\u5f55\u5c4f+\u884c\u4e3a\u65e5\u5fd7\u751f\u6210\u3002") 18 42 340 34 8.5 ([System.Drawing.FontStyle]::Regular) (New-UiColor 71 85 105) | Out-Null

Add-Label $mainPanel (U "1  \u9009\u53f3\u4fa7\u8fd0\u884c\u4e2d\u7a97\u53e3") 18 90 250 22 10 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
Add-Label $mainPanel (U "\u70b9\u53f3\u4fa7\u7684\u5237\u65b0\u7a97\u53e3\uff0c\u7136\u540e\u9009 seq\u3002") 36 114 310 20 8.5 ([System.Drawing.FontStyle]::Regular) (New-UiColor 100 116 139) | Out-Null
$mainRefreshProfilesButton = Add-Button $mainPanel (U "\u5237\u65b0\u53f3\u4fa7\u7a97\u53e3") 36 140 220 30

Add-Label $mainPanel (U "2  \u5f55\u5c4f\u524d\uff1a\u5f00\u59cb\u884c\u4e3a\u76d1\u63a7") 18 186 310 22 10 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
$mainIncludeTextCheckBox = New-Object System.Windows.Forms.CheckBox
$mainIncludeTextCheckBox.Text = U "\u8bb0\u5f55\u8f93\u5165\u6587\u672c"
$mainIncludeTextCheckBox.Checked = $true
$mainIncludeTextCheckBox.Location = New-UiPoint 36 212
$mainIncludeTextCheckBox.Size = New-UiSize 130 22
$mainIncludeTextCheckBox.Font = New-UiFont 8.5
$mainIncludeTextCheckBox.BackColor = [System.Drawing.Color]::White
$mainPanel.Controls.Add($mainIncludeTextCheckBox)
Add-Label $mainPanel (U "\u9ed8\u8ba4\u5f00\u542f\uff0c\u5bc6\u7801\u81ea\u52a8\u906e\u853d") 172 214 170 18 8 ([System.Drawing.FontStyle]::Regular) (New-UiColor 100 116 139) | Out-Null
$mainStartMonitorButton = Add-Button $mainPanel (U "\u5f00\u59cb\u884c\u4e3a\u76d1\u63a7") 36 240 310 34 $true

Add-Label $mainPanel (U "3  \u5f55\u5b8c\u540e\uff1a\u5bfc\u5165\u5f55\u5c4f") 18 294 260 22 10 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
$mainVideoPathBox = New-Object System.Windows.Forms.TextBox
$mainVideoPathBox.Location = New-UiPoint 36 322
$mainVideoPathBox.Size = New-UiSize 232 25
$mainVideoPathBox.Font = New-UiFont 9
$mainPanel.Controls.Add($mainVideoPathBox)
$mainBrowseVideoButton = Add-Button $mainPanel (U "\u9009\u62e9") 276 320 70 29
$mainImportVideoButton = Add-Button $mainPanel (U "\u5bfc\u5165\u5f55\u5c4f\u5305") 36 360 150 34 $true
$mainOpenMonitorDirButton = Add-Button $mainPanel (U "\u6253\u5f00\u76d1\u63a7\u76ee\u5f55") 196 360 150 34
$mainOpenVideoIntakeDirButton = Add-Button $mainPanel (U "\u6253\u5f00\u5f55\u5c4f\u5305") 36 400 150 28

$recordPanel = New-Object System.Windows.Forms.Panel
$recordPanel.Location = New-UiPoint 14 92
$recordPanel.Size = New-UiSize 386 178
$recordPanel.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($recordPanel)

Add-Label $recordPanel (U "\u5f55\u5236\u65b0\u6d41\u7a0b") 16 12 180 22 10.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
Add-Label $recordPanel (U "\u76ee\u6807\u7f51\u5740\uff08\u4e00\u884c\u4e00\u4e2a\uff09") 16 44 180 18 8.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 71 85 105) | Out-Null
$urlBox = New-Object System.Windows.Forms.TextBox
$urlBox.Text = "https://"
$urlBox.Location = New-UiPoint 16 64
$urlBox.Size = New-UiSize 354 50
$urlBox.Font = New-UiFont 9.5
$urlBox.Multiline = $true
$urlBox.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
$recordPanel.Controls.Add($urlBox)

Add-Label $recordPanel (U "\u5f55\u5236\u8f93\u51fa") 16 120 110 18 8.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 71 85 105) | Out-Null
$outputBox = New-Object System.Windows.Forms.TextBox
$outputBox.Text = $defaultOutput
$outputBox.Location = New-UiPoint 16 140
$outputBox.Size = New-UiSize 230 25
$outputBox.Font = New-UiFont 9.5
$recordPanel.Controls.Add($outputBox)

$recordButton = Add-Button $recordPanel (U "\u5f00\u59cb\u5f55\u5236") 258 138 112 29 $true

$scriptPanel = New-Object System.Windows.Forms.Panel
$scriptPanel.Location = New-UiPoint 14 282
$scriptPanel.Size = New-UiSize 386 246
$scriptPanel.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($scriptPanel)

Add-Label $scriptPanel (U "\u811a\u672c\u5e93") 16 12 120 22 10.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
Add-Label $scriptPanel (U "\u811a\u672c\u540d") 16 42 70 18 8.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 71 85 105) | Out-Null
$flowNameBox = New-Object System.Windows.Forms.TextBox
$flowNameBox.Text = "my-flow"
$flowNameBox.Location = New-UiPoint 82 39
$flowNameBox.Size = New-UiSize 148 25
$flowNameBox.Font = New-UiFont 9.5
$scriptPanel.Controls.Add($flowNameBox)

$saveButton = Add-Button $scriptPanel (U "\u4fdd\u5b58\u5f55\u5236") 242 37 128 29 $true

$scriptList = New-Object System.Windows.Forms.ListBox
$scriptList.Location = New-UiPoint 16 78
$scriptList.Size = New-UiSize 354 116
$scriptList.Font = New-UiFont 9
$scriptList.BackColor = New-UiColor 248 250 252
$scriptPanel.Controls.Add($scriptList)

$refreshScriptsButton = Add-Button $scriptPanel (U "\u5237\u65b0\u811a\u672c") 16 204 106 28
$openScriptsButton = Add-Button $scriptPanel (U "\u6253\u5f00\u76ee\u5f55") 132 204 106 28
$deleteScriptButton = Add-Button $scriptPanel (U "\u5220\u9664\u811a\u672c") 248 204 106 28 $false $true

$browserPanel = New-Object System.Windows.Forms.Panel
$browserPanel.Location = New-UiPoint 420 92
$browserPanel.Size = New-UiSize 386 306
$browserPanel.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($browserPanel)

Add-Label $browserPanel (U "\u6bd4\u7279\u6d4f\u89c8\u5668\u7a97\u53e3") 16 12 210 22 10.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
Add-Label $browserPanel (U "API") 16 44 40 18 8.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 71 85 105) | Out-Null
$apiBox = New-Object System.Windows.Forms.TextBox
$apiBox.Text = $env:BITBROWSER_API
if ([string]::IsNullOrWhiteSpace($apiBox.Text)) {
  $apiBox.Text = "http://127.0.0.1:54345"
}
$apiBox.Location = New-UiPoint 54 40
$apiBox.Size = New-UiSize 206 25
$apiBox.Font = New-UiFont 9
$browserPanel.Controls.Add($apiBox)

$refreshProfilesButton = Add-Button $browserPanel (U "\u5237\u65b0\u7a97\u53e3") 272 38 98 29

$profileList = New-Object System.Windows.Forms.ListBox
$profileList.Location = New-UiPoint 16 78
$profileList.Size = New-UiSize 354 178
$profileList.Font = New-UiFont 9
$profileList.BackColor = New-UiColor 248 250 252
$browserPanel.Controls.Add($profileList)

Add-Label $browserPanel (U "\u9009\u4e2d\u8fd0\u884c\u4e2d\u7684\u7a97\u53e3\uff0c\u518d\u70b9\u53f3\u4e0b\u89d2\u6267\u884c\u3002") 16 268 354 22 8.5 ([System.Drawing.FontStyle]::Regular) (New-UiColor 100 116 139) | Out-Null

$runPanel = New-Object System.Windows.Forms.Panel
$runPanel.Location = New-UiPoint 420 414
$runPanel.Size = New-UiSize 386 130
$runPanel.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($runPanel)

Add-Label $runPanel (U "\u811a\u672c\u5e93") 16 12 120 22 10.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
Add-Label $runPanel (U "\u5728\u8fd9\u91cc\u9009\u4f60\u7684\u811a\u672c\uff0c\u53ef\u4ee5\u76f4\u63a5\u5e94\u7528\uff0c\u4e5f\u53ef\u4ee5\u7ed9\u5b83\u7eed\u5f55\u65b0\u64cd\u4f5c\u3002") 16 34 354 20 8.5 ([System.Drawing.FontStyle]::Regular) (New-UiColor 100 116 139) | Out-Null
Add-Label $runPanel (U "\u5f53\u524d\u811a\u672c") 16 60 70 18 8.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 71 85 105) | Out-Null
$mainSelectedScriptBox = New-Object System.Windows.Forms.TextBox
$mainSelectedScriptBox.Location = New-UiPoint 86 56
$mainSelectedScriptBox.Size = New-UiSize 172 25
$mainSelectedScriptBox.Font = New-UiFont 9
$mainSelectedScriptBox.ReadOnly = $true
$mainSelectedScriptBox.BackColor = New-UiColor 248 250 252
$runPanel.Controls.Add($mainSelectedScriptBox)
$openLibraryButton = Add-Button $runPanel (U "\u6253\u5f00\u811a\u672c\u5e93") 268 55 102 29
$appendSelectedButton = Add-Button $runPanel (U "\u7ee7\u7eed\u8ffd\u52a0") 16 92 172 28
$runSelectedButton = Add-Button $runPanel (U "\u5e94\u7528\u5230\u6240\u9009\u7a97\u53e3") 198 92 172 28 $true

$templatePanel = New-Object System.Windows.Forms.Panel
$templatePanel.Location = New-UiPoint 14 540
$templatePanel.Size = New-UiSize 792 118
$templatePanel.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($templatePanel)

Add-Label $templatePanel (U "\u6a21\u677f\u4e0e\u526a\u8d34\u677f") 16 12 180 22 10.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
Add-Label $templatePanel (U "\u751f\u6210\u591a\u7f51\u5740\u6d41\u7a0b\u6a21\u677f\uff0c\u6216\u628a\u5f53\u524d\u526a\u8d34\u677f\u6587\u672c\u4fdd\u5b58\u5230 CSV\u3002") 190 14 570 20 8.5 ([System.Drawing.FontStyle]::Regular) (New-UiColor 100 116 139) | Out-Null

$sameTabTemplateButton = Add-Button $templatePanel (U "\u540c\u6807\u7b7e\u591a\u7f51\u5740") 16 50 178 28
$multiTabsTemplateButton = Add-Button $templatePanel (U "\u591a\u6807\u7b7e\u9875") 204 50 178 28
$popupTemplateButton = Add-Button $templatePanel (U "\u5f39\u7a97/\u65b0\u7a97\u53e3") 392 50 178 28
$clipboardTemplateButton = Add-Button $templatePanel (U "\u8bfb\u526a\u8d34\u677f\u6a21\u677f") 580 50 196 28
$saveClipboardButton = Add-Button $templatePanel (U "\u4fdd\u5b58\u5f53\u524d\u526a\u8d34\u677f") 16 84 178 28 $true
$openClipboardCsvButton = Add-Button $templatePanel (U "\u6253\u5f00\u526a\u8d34\u677f CSV") 204 84 178 28

$assistPanel = New-Object System.Windows.Forms.Panel
$assistPanel.Location = New-UiPoint 14 672
$assistPanel.Size = New-UiSize 792 122
$assistPanel.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($assistPanel)

Add-Label $assistPanel (U "\u5f55\u5c4f\u8f85\u52a9") 16 12 120 22 10.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
Add-Label $assistPanel (U "\u5f55\u5c4f\u65f6\u5f00\u884c\u4e3a\u76d1\u63a7\uff0c\u5f55\u5b8c\u540e\u5bfc\u5165\u89c6\u9891\u751f\u6210\u4efb\u52a1\u5305\u3002") 132 14 520 20 8.5 ([System.Drawing.FontStyle]::Regular) (New-UiColor 100 116 139) | Out-Null

$includeTextCheckBox = New-Object System.Windows.Forms.CheckBox
$includeTextCheckBox.Text = U "\u8bb0\u5f55\u8f93\u5165\u6587\u672c"
$includeTextCheckBox.Checked = $true
$includeTextCheckBox.Location = New-UiPoint 648 12
$includeTextCheckBox.Size = New-UiSize 120 24
$includeTextCheckBox.Font = New-UiFont 8.5
$includeTextCheckBox.BackColor = [System.Drawing.Color]::White
$assistPanel.Controls.Add($includeTextCheckBox)
Add-Label $assistPanel (U "\u9ed8\u8ba4\u5f00\u542f\uff0c\u5bc6\u7801\u4ecd\u81ea\u52a8\u906e\u853d") 560 34 220 16 8 ([System.Drawing.FontStyle]::Regular) (New-UiColor 100 116 139) | Out-Null

$startMonitorButton = Add-Button $assistPanel (U "\u5f00\u59cb\u884c\u4e3a\u76d1\u63a7") 16 46 178 30 $true
$openMonitorDirButton = Add-Button $assistPanel (U "\u6253\u5f00\u76d1\u63a7\u76ee\u5f55") 204 46 178 30
$openVideoIntakeDirButton = Add-Button $assistPanel (U "\u6253\u5f00\u5f55\u5c4f\u5305\u76ee\u5f55") 392 46 178 30

Add-Label $assistPanel (U "\u5f55\u5c4f\u6587\u4ef6") 16 88 78 18 8.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 71 85 105) | Out-Null
$videoPathBox = New-Object System.Windows.Forms.TextBox
$videoPathBox.Location = New-UiPoint 92 84
$videoPathBox.Size = New-UiSize 376 25
$videoPathBox.Font = New-UiFont 9
$assistPanel.Controls.Add($videoPathBox)
$browseVideoButton = Add-Button $assistPanel (U "\u9009\u62e9") 478 82 72 29
$importVideoButton = Add-Button $assistPanel (U "\u5bfc\u5165\u5f55\u5c4f\u5305") 560 82 216 29 $true

$status = New-Object System.Windows.Forms.Label
$status.Text = U "\u5c31\u7eea\uff1a\u5148\u5f55\u5236\u6216\u9009\u62e9\u5df2\u4fdd\u5b58\u7684\u811a\u672c"
$status.ForeColor = New-UiColor 51 65 85
$status.Location = New-UiPoint 22 818
$status.Size = New-UiSize 760 24
$status.Font = New-UiFont 9
$form.Controls.Add($status)

function Refresh-ScriptList {
  $preferredRelative = $script:selectedScriptRelative
  if ([string]::IsNullOrWhiteSpace($preferredRelative) -and $scriptList.SelectedItem) {
    $preferredRelative = $scriptMap[[string]$scriptList.SelectedItem]
  }

  $scriptList.Items.Clear()
  $scriptMap.Clear()

  $entries = @(Get-ScriptEntries)
  foreach ($entry in $entries) {
    $display = Get-ScriptDisplayText -Entry $entry
    [void]$scriptList.Items.Add($display)
    $scriptMap[$display] = $entry.Relative
  }

  if ($scriptList.Items.Count -gt 0) {
    if ([string]::IsNullOrWhiteSpace($preferredRelative)) {
      $preferredRelative = Get-DefaultSelectedScriptRelative -Entries $entries
    }

    $matched = $false
    foreach ($item in $scriptList.Items) {
      if ($scriptMap[[string]$item] -eq $preferredRelative) {
        $scriptList.SelectedItem = $item
        $matched = $true
        break
      }
    }

    if (-not $matched) {
      $scriptList.SelectedIndex = 0
    }
  } else {
    $script:selectedScriptRelative = ""
  }
}

function Update-MainSelectedScript {
  if (-not $mainSelectedScriptBox) {
    return
  }

  if ($scriptList.SelectedItem) {
    $script:selectedScriptRelative = $scriptMap[[string]$scriptList.SelectedItem]
  }

  if ([string]::IsNullOrWhiteSpace($script:selectedScriptRelative)) {
    $mainSelectedScriptBox.Text = (U "\u8fd8\u6ca1\u6709\u811a\u672c")
    return
  }

  $mainSelectedScriptBox.Text = Split-Path $script:selectedScriptRelative -Leaf
}

function Select-ScriptByRelative {
  param([string]$RelativePath)

  $script:selectedScriptRelative = $RelativePath
  if (-not [string]::IsNullOrWhiteSpace($RelativePath)) {
    foreach ($item in $scriptList.Items) {
      if ($scriptMap[[string]$item] -eq $RelativePath) {
        $scriptList.SelectedItem = $item
        Update-MainSelectedScript
        return
      }
    }
  }

  Update-MainSelectedScript
}

function Get-SelectedScriptRelative {
  if ($scriptList.SelectedItem) {
    return $scriptMap[[string]$scriptList.SelectedItem]
  }
  return $script:selectedScriptRelative
}

function Rename-SavedScript {
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  if (-not $RelativePath.StartsWith("tests\saved-flows\")) {
    [System.Windows.Forms.MessageBox]::Show((U "\u53ea\u80fd\u91cd\u547d\u540d\u811a\u672c\u5e93\u91cc\u7684\u5df2\u4fdd\u5b58\u811a\u672c\u3002"), (U "\u4e0d\u53ef\u91cd\u547d\u540d")) | Out-Null
    return $false
  }

  $sourcePath = Join-Path $root $RelativePath
  $defaultName = Split-Path $RelativePath -Leaf
  $defaultName = [regex]::Replace($defaultName, '\.spec\.ts$', '', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $inputName = [Microsoft.VisualBasic.Interaction]::InputBox((U "\u8f93\u5165\u65b0\u7684\u811a\u672c\u540d"), (U "\u91cd\u547d\u540d\u811a\u672c"), $defaultName)
  if ([string]::IsNullOrWhiteSpace($inputName)) {
    return $false
  }

  $normalizedName = Get-NormalizedScriptFileName -Value $inputName
  if ([string]::IsNullOrWhiteSpace($normalizedName)) {
    [System.Windows.Forms.MessageBox]::Show((U "\u811a\u672c\u540d\u4e0d\u80fd\u4e3a\u7a7a\u3002"), (U "\u540d\u79f0\u65e0\u6548")) | Out-Null
    return $false
  }

  $targetPath = Join-Path $savedDir $normalizedName
  if ($sourcePath -ieq $targetPath) {
    return $false
  }
  if (Test-Path $targetPath) {
    [System.Windows.Forms.MessageBox]::Show((U "\u540c\u540d\u811a\u672c\u5df2\u5b58\u5728\uff0c\u8bf7\u6362\u4e2a\u540d\u5b57\u3002"), (U "\u91cd\u540d")) | Out-Null
    return $false
  }

  Move-Item -LiteralPath $sourcePath -Destination $targetPath
  $script:selectedScriptRelative = To-RelativePath $targetPath
  Refresh-ScriptList
  Select-ScriptByRelative -RelativePath $script:selectedScriptRelative
  $status.Text = (U "\u5df2\u91cd\u547d\u540d\u811a\u672c\uff1a") + $script:selectedScriptRelative
  return $true
}

function Open-ScriptLibraryDialog {
  Refresh-ScriptList

  $dialog = New-Object System.Windows.Forms.Form
  $dialog.Text = U "\u6211\u7684\u811a\u672c"
  $dialog.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterParent
  $dialog.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
  $dialog.MaximizeBox = $false
  $dialog.MinimizeBox = $false
  $dialog.ClientSize = New-UiSize 700 360
  $dialog.BackColor = New-UiColor 241 245 249
  $dialog.Font = New-UiFont 9

  Add-Label $dialog (U "\u6211\u7684\u811a\u672c") 16 14 180 24 11 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
  Add-Label $dialog (U "\u8fd9\u91cc\u53ea\u663e\u793a\u4f60\u5df2\u4fdd\u5b58\u8fdb\u811a\u672c\u5e93\u7684\u811a\u672c\uff0c\u53ef\u4ee5\u9009\u4e2d\u540e\u76f4\u63a5\u91cd\u547d\u540d\u3002") 16 42 668 18 8.5 ([System.Drawing.FontStyle]::Regular) (New-UiColor 100 116 139) | Out-Null

  $dialogList = New-Object System.Windows.Forms.ListBox
  $dialogList.Location = New-UiPoint 16 74
  $dialogList.Size = New-UiSize 668 214
  $dialogList.Font = New-UiFont 9
  $dialogList.BackColor = [System.Drawing.Color]::White
  $dialog.Controls.Add($dialogList)

  $dialogMap = @{}
  $refreshDialogList = {
    $current = $script:selectedScriptRelative
    $dialogList.Items.Clear()
    $dialogMap.Clear()
    $savedEntries = @(Get-SavedScriptEntries)
    foreach ($entry in $savedEntries) {
      $display = Get-ScriptDisplayText -Entry $entry
      [void]$dialogList.Items.Add($display)
      $dialogMap[$display] = $entry.Relative
    }

    if ($dialogList.Items.Count -gt 0) {
      $matched = $false
      foreach ($item in $dialogList.Items) {
        if ($dialogMap[[string]$item] -eq $current) {
          $dialogList.SelectedItem = $item
          $matched = $true
          break
        }
      }
      if (-not $matched) {
        $dialogList.SelectedIndex = 0
      }
    }
  }

  $useSelectedScript = {
    if (-not $dialogList.SelectedItem) {
      return
    }
    $relative = $dialogMap[[string]$dialogList.SelectedItem]
    Select-ScriptByRelative -RelativePath $relative
    $status.Text = (U "\u5df2\u9009\u4e2d\u811a\u672c\uff1a") + $relative
    $dialog.Close()
  }

  $renameScriptButton = Add-Button $dialog (U "\u91cd\u547d\u540d") 16 304 110 30
  $openLibraryDirButton = Add-Button $dialog (U "\u6253\u5f00\u76ee\u5f55") 136 304 110 30
  $useScriptButton = Add-Button $dialog (U "\u4f7f\u7528\u8fd9\u4e2a\u811a\u672c") 456 304 110 30
  $closeDialogButton = Add-Button $dialog (U "\u5173\u95ed") 574 304 110 30
  Style-Button $useScriptButton $true $false

  $renameScriptButton.Add_Click({
    if (-not $dialogList.SelectedItem) {
      return
    }
    $relative = $dialogMap[[string]$dialogList.SelectedItem]
    if (Rename-SavedScript -RelativePath $relative) {
      & $refreshDialogList
    }
  })

  $openLibraryDirButton.Add_Click({
    if (-not (Test-Path $savedDir)) {
      New-Item -ItemType Directory -Path $savedDir | Out-Null
    }
    Start-Process explorer.exe -ArgumentList @($savedDir)
  })

  $useScriptButton.Add_Click($useSelectedScript)
  $closeDialogButton.Add_Click({ $dialog.Close() })
  $dialogList.Add_DoubleClick($useSelectedScript)

  & $refreshDialogList

  if ($dialogList.Items.Count -eq 0) {
    [System.Windows.Forms.MessageBox]::Show((U "\u811a\u672c\u5e93\u8fd8\u6ca1\u6709\u5df2\u4fdd\u5b58\u7684\u811a\u672c\uff0c\u5148\u628a\u5f55\u5236\u4fdd\u5b58\u8fdb\u811a\u672c\u5e93\u3002"), (U "\u6682\u65e0\u811a\u672c")) | Out-Null
    return
  }

  [void]$dialog.ShowDialog($form)
}

function Refresh-ProfileList {
  $profileList.Items.Clear()
  $profileMap.Clear()

  try {
    $body = @{ page = 0; pageSize = 100 } | ConvertTo-Json
    $resp = Invoke-RestMethod -Uri (($apiBox.Text.TrimEnd('/')) + "/browser/list") -Method Post -ContentType "application/json" -Body $body -TimeoutSec 10
    if (-not $resp.success) {
      throw ($resp.msg | Out-String)
    }

    $profiles = @($resp.data.list | Sort-Object -Property @{ Expression = { if ($_.status -eq 1) { 0 } else { 1 } } }, seq)
    foreach ($profile in $profiles) {
      $state = if ($profile.status -eq 1) { U "\u8fd0\u884c\u4e2d" } else { U "\u5df2\u5173\u95ed" }
      $country = if ([string]::IsNullOrWhiteSpace([string]$profile.lastCountry)) { "" } else { [string]$profile.lastCountry }
      $display = "seq {0}  |  {1}  |  {2}  |  {3}" -f $profile.seq, $state, $country, $profile.id
      [void]$profileList.Items.Add($display)
      $profileMap[$display] = @{
        seq = [string]$profile.seq
        id = [string]$profile.id
        status = [int]$profile.status
      }
    }

    if ($profileList.Items.Count -gt 0) {
      $profileList.SelectedIndex = 0
      $status.Text = (U "\u5df2\u5237\u65b0\u7a97\u53e3\uff1a") + $profileList.Items.Count
    } else {
      $status.Text = U "\u6ca1\u6709\u627e\u5230\u6bd4\u7279\u6d4f\u89c8\u5668\u914d\u7f6e"
    }
  } catch {
    $status.Text = (U "\u6bd4\u7279 API \u8fde\u63a5\u5931\u8d25\uff1a") + $_.Exception.Message
  }
}

function Get-FlowSlug {
  $name = $flowNameBox.Text.Trim()
  if ([string]::IsNullOrWhiteSpace($name)) {
    $name = "flow-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  }
  $name = [regex]::Replace($name, '\.spec\.ts$', '', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $name = [regex]::Replace($name, '[^\w\-.]+', '-').Trim('-')
  if ([string]::IsNullOrWhiteSpace($name)) {
    return "flow-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  }
  return $name
}

function Get-SelectedProfile {
  if (-not $profileList.SelectedItem) {
    [System.Windows.Forms.MessageBox]::Show((U "\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u6bd4\u7279\u6d4f\u89c8\u5668\u7a97\u53e3\u3002"), (U "\u672a\u9009\u7a97\u53e3")) | Out-Null
    return $null
  }

  $profile = $profileMap[[string]$profileList.SelectedItem]
  if ($profile.status -ne 1) {
    [System.Windows.Forms.MessageBox]::Show((U "\u8bf7\u9009\u62e9\u8fd0\u884c\u4e2d\u7684\u6bd4\u7279\u6d4f\u89c8\u5668\u7a97\u53e3\u3002"), (U "\u7a97\u53e3\u672a\u8fd0\u884c")) | Out-Null
    return $null
  }

  return $profile
}

function Get-FirstRecordUrl {
  $urls = @(Get-RecordUrls)
  if ($urls.Count -gt 0 -and $urls[0] -match '^https?://') {
    return $urls[0]
  }
  return ""
}

function Open-RepoDirectory {
  param([Parameter(Mandatory = $true)][string]$RelativePath)
  if ([System.IO.Path]::IsPathRooted($RelativePath)) {
    $target = $RelativePath
  } else {
    $target = Join-Path $root $RelativePath
  }
  if (-not (Test-Path $target)) {
    New-Item -ItemType Directory -Path $target | Out-Null
  }
  Start-Process explorer.exe -ArgumentList @($target)
}

function Start-ActionMonitor {
  param(
    [bool]$IncludeText,
    [string]$AppendTargetRelative = ""
  )

  if ($script:activeMonitorProcess -and -not $script:activeMonitorProcess.HasExited) {
    [System.Windows.Forms.MessageBox]::Show((U "\u5df2\u6709\u884c\u4e3a\u76d1\u63a7\u5728\u8fd0\u884c\uff0c\u8bf7\u5148\u7ed3\u675f\u5f53\u524d\u5f55\u5c4f\u3002"), (U "\u76d1\u63a7\u8fd0\u884c\u4e2d")) | Out-Null
    return
  }

  $profile = Get-SelectedProfile
  if ($null -eq $profile) {
    return
  }

  if (-not (Test-Path $recordingPackageRoot)) {
    New-Item -ItemType Directory -Path $recordingPackageRoot -Force | Out-Null
  }

  $name = if ([string]::IsNullOrWhiteSpace($AppendTargetRelative)) { Get-FlowSlug } else { (Get-ScriptSlugFromRelativePath $AppendTargetRelative) + "-append" }
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stopFile = Join-Path $recordingPackageRoot ("stop-" + $name + "-" + $stamp + ".signal")
  if (Test-Path $stopFile) {
    Remove-Item -LiteralPath $stopFile -Force
  }
  $logDir = Join-Path $recordingPackageRoot "_logs"
  if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  $script:monitorLaunchOut = Join-Path $logDir ("monitor-" + $name + "-" + $stamp + ".out.log")
  $script:monitorLaunchErr = Join-Path $logDir ("monitor-" + $name + "-" + $stamp + ".err.log")

  $apiValue = $apiBox.Text.Trim()
  if ([string]::IsNullOrWhiteSpace($apiValue)) {
    $apiValue = "http://127.0.0.1:54345"
  }

  $command = "`$env:BITBROWSER_API=$(Quote-Pwsh $apiValue); node tools\bitbrowser-action-monitor.mjs $(Quote-Pwsh $profile.seq) --name $(Quote-Pwsh $name) --output-root $(Quote-Pwsh $recordingPackageRoot) --stop-file $(Quote-Pwsh $stopFile)"
  if ($IncludeText) {
    $confirm = [System.Windows.Forms.MessageBox]::Show((U "\u5f00\u542f\u540e\u4f1a\u8bb0\u5f55\u666e\u901a\u8f93\u5165\u6846\u6587\u672c\uff0c\u5bc6\u7801\u7c7b\u5b57\u6bb5\u4ecd\u4f1a\u906e\u853d\u3002\u786e\u8ba4\u7ee7\u7eed\uff1f"), (U "\u8bb0\u5f55\u8f93\u5165\u6587\u672c"), [System.Windows.Forms.MessageBoxButtons]::YesNo)
    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) {
      return
    }
    $command += " --include-text"
  }

  $script:activeMonitorProcess = Start-RepoHiddenCommand -Command $command -OutFile $script:monitorLaunchOut -ErrFile $script:monitorLaunchErr
  $script:activeMonitorStopFile = $stopFile
  $script:activeMonitorName = $name
  $script:activeMonitorStartedAt = Get-Date
  $script:activeMonitorAppendTarget = $AppendTargetRelative
  if ([string]::IsNullOrWhiteSpace($AppendTargetRelative)) {
    $status.Text = (U "\u884c\u4e3a\u76d1\u63a7\u4e2d\uff1a") + $name
  } else {
    $status.Text = (U "\u7eed\u5f55\u4e2d\uff1a") + $AppendTargetRelative
  }
  Set-RecordingFloatMode -Recording $true
}

function Stop-ActionMonitor {
  if (-not $script:activeMonitorProcess) {
    Set-RecordingFloatMode -Recording $false
    return
  }

  if ($script:activeMonitorStopFile) {
    New-Item -ItemType File -Path $script:activeMonitorStopFile -Force | Out-Null
  }

  $floatingHint.Text = U "\u6b63\u5728\u751f\u6210\u5f55\u5c4f\u5305..."
  $stopRecordingButton.Enabled = $false
  Begin-MonitorFinishPolling
}

function Select-VideoFile {
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = U "\u9009\u62e9\u5f55\u5c4f\u6587\u4ef6"
  $dialog.Filter = "Video files|*.mp4;*.mov;*.mkv;*.webm;*.avi;*.m4v|All files|*.*"
  $dialog.Multiselect = $false
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $videoPathBox.Text = $dialog.FileName
    $mainVideoPathBox.Text = $dialog.FileName
    $status.Text = (U "\u5df2\u9009\u62e9\u5f55\u5c4f\uff1a") + $dialog.SafeFileName
  }
}

function Import-VideoIntake {
  param([string]$VideoPath)

  $videoPath = $VideoPath.Trim()
  if ([string]::IsNullOrWhiteSpace($videoPath) -or -not (Test-Path $videoPath)) {
    [System.Windows.Forms.MessageBox]::Show((U "\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u5b58\u5728\u7684\u5f55\u5c4f\u6587\u4ef6\u3002"), (U "\u5f55\u5c4f\u6587\u4ef6\u65e0\u6548")) | Out-Null
    return
  }

  $name = Get-FlowSlug
  $startUrl = Get-FirstRecordUrl
  $command = "node tools\video-to-pw-intake.mjs $(Quote-Pwsh $videoPath) --name $(Quote-Pwsh $name) --output-root $(Quote-Pwsh $recordingPackageRoot)"
  if (-not [string]::IsNullOrWhiteSpace($startUrl)) {
    $command += " --url $(Quote-Pwsh $startUrl)"
  }

  Start-RepoCommand -Command $command -Title "Video To Playwright Intake" -KeepOpen
  $status.Text = (U "\u5df2\u542f\u52a8\u5f55\u5c4f\u5bfc\u5165\uff1a\u8f93\u51fa\u5728 ") + $recordingPackageRoot
}

function Sync-IncludeTextOption {
  param([bool]$Checked)

  if ($script:syncingIncludeText) {
    return
  }

  $script:syncingIncludeText = $true
  $mainIncludeTextCheckBox.Checked = $Checked
  $includeTextCheckBox.Checked = $Checked
  $script:syncingIncludeText = $false
}

function Set-AdvancedMode {
  param([bool]$Advanced)

  $mainPanel.Visible = -not $Advanced
  $recordPanel.Visible = $Advanced
  $scriptPanel.Visible = $Advanced
  $runPanel.Visible = -not $Advanced
  $templatePanel.Visible = $Advanced
  $assistPanel.Visible = $Advanced

  if ($Advanced) {
    $form.ClientSize = New-UiSize 820 858
    $status.Location = New-UiPoint 22 818
    $modeButton.Text = U "\u4e3b\u6d41\u7a0b"
    $status.Text = U "\u9ad8\u7ea7\u529f\u80fd\uff1a\u624b\u52a8 codegen\u3001\u811a\u672c\u5e93\u3001\u6a21\u677f\u548c\u526a\u8d34\u677f"
  } else {
    $form.ClientSize = New-UiSize 820 592
    $status.Location = New-UiPoint 22 552
    $modeButton.Text = U "\u9ad8\u7ea7\u529f\u80fd"
    $status.Text = U "\u4e3b\u6d41\u7a0b\uff1a\u5148\u9009\u53f3\u4fa7\u7a97\u53e3\uff0c\u518d\u5f00\u884c\u4e3a\u76d1\u63a7\uff0c\u6700\u540e\u5bfc\u5165\u5f55\u5c4f"
  }
}

function Enter-BallMode {
  if ($script:isBallMode) {
    return
  }

  $script:lastFullLocation = $form.Location
  $script:isBallMode = $true
  $header.Visible = $false
  $mainPanel.Visible = $false
  $recordPanel.Visible = $false
  $scriptPanel.Visible = $false
  $browserPanel.Visible = $false
  $runPanel.Visible = $false
  $templatePanel.Visible = $false
  $assistPanel.Visible = $false
  $status.Visible = $false
  $floatingPanel.Visible = $false
  $ballPanel.Visible = $true

  $form.SuspendLayout()
  $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
  $form.ShowInTaskbar = $false
  $form.MinimizeBox = $false
  $form.MaximizeBox = $false
  $form.ClientSize = New-UiSize 72 72
  $form.BackColor = New-UiColor 37 99 235
  $form.TopMost = $true
  Set-CircularFormRegion -Diameter 72

  if ($script:lastFullLocation) {
    $screen = [System.Windows.Forms.Screen]::FromPoint($script:lastFullLocation).WorkingArea
    $x = [Math]::Min([Math]::Max($script:lastFullLocation.X, $screen.Left), $screen.Right - $form.Width)
    $y = [Math]::Min([Math]::Max($script:lastFullLocation.Y, $screen.Top), $screen.Bottom - $form.Height)
    $form.Location = New-UiPoint $x $y
  }
  $form.ResumeLayout()
}

function Exit-BallMode {
  if (-not $script:isBallMode) {
    return
  }

  $script:isBallMode = $false
  $ballPanel.Visible = $false
  $form.SuspendLayout()
  $form.Region = $null
  $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
  $form.ShowInTaskbar = $true
  $form.MinimizeBox = $true
  $form.MaximizeBox = $false
  $form.BackColor = New-UiColor 241 245 249
  $header.Visible = $true
  $browserPanel.Visible = $true
  $status.Visible = $true
  Set-AdvancedMode -Advanced $false
  if ($script:lastFullLocation) {
    $form.Location = $script:lastFullLocation
  }
  $form.Activate()
  $form.ResumeLayout()
}

function Set-RecordingFloatMode {
  param([bool]$Recording)

  if ($Recording) {
    $script:isBallMode = $false
    $script:normalLocation = $form.Location
    $header.Visible = $false
    $mainPanel.Visible = $false
    $recordPanel.Visible = $false
    $scriptPanel.Visible = $false
    $browserPanel.Visible = $false
    $runPanel.Visible = $false
    $templatePanel.Visible = $false
    $assistPanel.Visible = $false
    $status.Visible = $false
    $ballPanel.Visible = $false
    $floatingPanel.Visible = $true
    $stopRecordingButton.Visible = $false
    $stopRecordingButton.Enabled = $true
    if ([string]::IsNullOrWhiteSpace($script:activeMonitorAppendTarget)) {
      $floatingTitle.Text = U "\u5f55\u5c4f\u4e2d"
      $floatingHint.Text = U "\u9f20\u6807\u79fb\u5165\u663e\u793a\u7ed3\u675f\u6309\u94ae"
    } else {
      $floatingTitle.Text = U "\u6b63\u5728\u7eed\u5f55"
      $floatingHint.Text = U "\u7ed3\u675f\u540e\u4f1a\u81ea\u52a8\u751f\u6210\u8ffd\u52a0\u5305"
    }
    $form.ClientSize = New-UiSize 280 88
    $form.Text = U "\u5f55\u5c4f\u4e2d"
    $form.TopMost = $true
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $form.Location = New-UiPoint ($screen.Right - $form.Width - 18) ($screen.Bottom - $form.Height - 18)
    return
  }

  $floatingPanel.Visible = $false
  $ballPanel.Visible = $false
  $stopRecordingButton.Visible = $false
  $stopRecordingButton.Enabled = $true
  $header.Visible = $true
  $browserPanel.Visible = $true
  $status.Visible = $true
  $floatingTitle.Text = U "\u5f55\u5c4f\u4e2d"
  $form.Text = U "\u811a\u672c\u6d41\u7a0b\u5de5\u4f5c\u53f0"
  if ($script:normalLocation) {
    $form.Location = $script:normalLocation
  }
  $form.Region = $null
  $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
  $form.ShowInTaskbar = $true
  $form.BackColor = New-UiColor 241 245 249
  Set-AdvancedMode -Advanced $false
}

function Get-LatestRecordingPackage {
  if (-not (Test-Path $recordingPackageRoot)) {
    return $null
  }
  $prefix = if ([string]::IsNullOrWhiteSpace($script:activeMonitorName)) { "*" } else { $script:activeMonitorName + "-*" }
  return Get-ChildItem -LiteralPath $recordingPackageRoot -Directory -Filter $prefix -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

function Get-RecordingEventCount {
  param([Parameter(Mandatory = $true)]$Package)

  $eventsPath = Join-Path $Package.FullName "events.jsonl"
  if (-not (Test-Path $eventsPath)) {
    return 0
  }

  $count = 0
  foreach ($line in (Get-Content -LiteralPath $eventsPath)) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }
    try {
      $event = $line | ConvertFrom-Json
      if ($event.eventType -ne "monitor-ready") {
        $count += 1
      }
    } catch {
      $count += 1
    }
  }
  return $count
}

function Complete-RecordingPackage {
  $package = Get-LatestRecordingPackage
  if ($package) {
    if (-not [string]::IsNullOrWhiteSpace($script:activeMonitorAppendTarget)) {
      Add-AppendTargetToPackage -Package $package -RelativePath $script:activeMonitorAppendTarget
    }
    $eventCount = Get-RecordingEventCount -Package $package
    $summary = Join-Path $package.FullName "summary.md"
    if (Test-Path $summary) {
      try { Set-Clipboard -Value $summary } catch {}
      if ([string]::IsNullOrWhiteSpace($script:activeMonitorAppendTarget)) {
        $status.Text = (U "\u5f55\u5c4f\u5305\u5df2\u751f\u6210\uff0csummary.md \u8def\u5f84\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f\uff1a") + $summary
      } else {
        $status.Text = (U "\u7eed\u5f55\u5305\u5df2\u751f\u6210\uff0csummary.md \u8def\u5f84\u5df2\u590d\u5236\uff0c\u76ee\u6807\u811a\u672c\uff1a") + $script:activeMonitorAppendTarget
      }
      Start-Process explorer.exe -ArgumentList @($package.FullName)
    } else {
      if ([string]::IsNullOrWhiteSpace($script:activeMonitorAppendTarget)) {
        $status.Text = (U "\u5f55\u5c4f\u5305\u5df2\u751f\u6210\uff1a") + $package.FullName
      } else {
        $status.Text = (U "\u7eed\u5f55\u5305\u5df2\u751f\u6210\uff1a") + $package.FullName
      }
      Start-Process explorer.exe -ArgumentList @($package.FullName)
    }

    if ($eventCount -eq 0) {
      $message = if ([string]::IsNullOrWhiteSpace($script:activeMonitorAppendTarget)) {
        (U "\u8fd9\u6b21\u5f55\u5c4f\u5305\u662f\u7a7a\u7684\uff0cevents.jsonl \u6ca1\u6709\u91c7\u5230\u4efb\u4f55\u52a8\u4f5c\u3002\u8bf7\u91cd\u65b0\u5f00\u59cb\u884c\u4e3a\u76d1\u63a7\uff0c\u786e\u8ba4\u5728\u9009\u4e2d\u7684\u6bd4\u7279\u7a97\u53e3\u91cc\u64cd\u4f5c\u540e\u518d\u7ed3\u675f\u5f55\u5c4f\u3002")
      } else {
        (U "\u8fd9\u6b21\u7eed\u5f55\u5305\u662f\u7a7a\u7684\uff0cevents.jsonl \u6ca1\u6709\u91c7\u5230\u4efb\u4f55\u65b0\u52a8\u4f5c\uff0c\u6240\u4ee5\u6211\u6ca1\u6cd5\u63a5\u5230\u73b0\u6709\u811a\u672c\u540e\u9762\u3002\u8bf7\u91cd\u65b0\u70b9\u201c\u7ee7\u7eed\u8ffd\u52a0\u201d\uff0c\u5728\u9009\u4e2d\u7684\u6bd4\u7279\u7a97\u53e3\u91cc\u5b8c\u6210\u65b0\u64cd\u4f5c\uff0c\u7136\u540e\u518d\u7ed3\u675f\u5f55\u5c4f\u3002")
      }
      [System.Windows.Forms.MessageBox]::Show($message, (U "\u672a\u91c7\u5230\u52a8\u4f5c")) | Out-Null
    }
  } else {
    $status.Text = U "\u672a\u627e\u5230\u672c\u6b21\u5f55\u5c4f\u5305\uff0c\u8bf7\u6253\u5f00\u5f55\u5c4f\u5305\u76ee\u5f55\u68c0\u67e5\u3002"
  }

  $script:activeMonitorProcess = $null
  $script:activeMonitorStopFile = $null
  $script:activeMonitorName = $null
  $script:activeMonitorStartedAt = $null
  $script:activeMonitorAppendTarget = $null
}

function Begin-MonitorFinishPolling {
  if ($script:monitorFinishTimer) {
    $script:monitorFinishTimer.Stop()
    $script:monitorFinishTimer.Dispose()
  }

  $script:monitorFinishTimer = New-Object System.Windows.Forms.Timer
  $script:monitorFinishTimer.Interval = 500
  $script:monitorFinishTimer.Add_Tick({
    if ($null -eq $script:activeMonitorProcess) {
      $script:monitorFinishTimer.Stop()
      return
    }
    $script:activeMonitorProcess.Refresh()
    if ($script:activeMonitorProcess.HasExited) {
      $script:monitorFinishTimer.Stop()
      $script:monitorFinishTimer.Dispose()
      $script:monitorFinishTimer = $null
      Set-RecordingFloatMode -Recording $false
      Complete-RecordingPackage
    }
  })
  $script:monitorFinishTimer.Start()
}

$recordButton.Add_Click({
  $urls = @(Get-RecordUrls)
  $output = $outputBox.Text.Trim()

  if ($urls.Count -lt 1) {
    [System.Windows.Forms.MessageBox]::Show((U "\u8bf7\u8f93\u5165\u81f3\u5c11\u4e00\u4e2a\u5b8c\u6574\u7f51\u5740\uff0c\u4f8b\u5982 https://example.com"), (U "\u7f51\u5740\u65e0\u6548")) | Out-Null
    return
  }

  foreach ($url in $urls) {
    if (-not ($url -match '^https?://')) {
      [System.Windows.Forms.MessageBox]::Show((U "\u6bcf\u4e00\u884c\u90fd\u9700\u8981\u5b8c\u6574\u7f51\u5740\uff0c\u4f8b\u5982 https://example.com"), (U "\u7f51\u5740\u65e0\u6548")) | Out-Null
      return
    }
  }

  if ([string]::IsNullOrWhiteSpace($output)) {
    [System.Windows.Forms.MessageBox]::Show((U "\u8bf7\u8f93\u5165\u5f55\u5236\u8f93\u51fa\u8def\u5f84\u3002"), (U "\u8def\u5f84\u65e0\u6548")) | Out-Null
    return
  }

  $outputDir = Split-Path -Parent (Join-Path $root $output)
  if ($outputDir -and -not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
  }

  if ($urls.Count -eq 1) {
    $startUrl = $urls[0]
    $status.Text = U "\u5f55\u5236\u4e2d\uff1a\u5355\u7f51\u5740\u6d41\u7a0b"
  } else {
    $navigatorPath = New-RecordingNavigator -Urls $urls
    $startUrl = ConvertTo-FileUrl $navigatorPath
    $status.Text = (U "\u5f55\u5236\u4e2d\uff1a\u591a\u7f51\u5740\u5bfc\u822a\u9875\uff0c\u5171 ") + $urls.Count + (U " \u4e2a\u7f51\u5740")
  }

  $command = "npm run pw:codegen -- -o $(Quote-Pwsh $output) $(Quote-Pwsh $startUrl)"
  Start-RepoCommand -Command $command -Title "Playwright Codegen"
})

$saveButton.Add_Click({
  $recorded = Join-Path $root $outputBox.Text.Trim()
  if (-not (Test-RecordedScript $recorded)) {
    [System.Windows.Forms.MessageBox]::Show((U "\u5f55\u5236\u6587\u4ef6\u8fd8\u6ca1\u6709\u53ef\u7528\u64cd\u4f5c\uff0c\u8bf7\u5148\u5f55\u5236\u5e76\u5173\u95ed\u5f55\u5236\u5668\u3002"), (U "\u65e0\u6cd5\u4fdd\u5b58")) | Out-Null
    return
  }

  $name = $flowNameBox.Text.Trim()
  if ([string]::IsNullOrWhiteSpace($name)) {
    $name = "flow-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  }
  $name = [regex]::Replace($name, '[^\w\-.]+', '-').Trim('-')
  if (-not $name.EndsWith(".spec.ts")) {
    $name = $name + ".spec.ts"
  }

  $target = Join-Path $savedDir $name
  Copy-Item -LiteralPath $recorded -Destination $target -Force
  Refresh-ScriptList
  $status.Text = (U "\u5df2\u4fdd\u5b58\u5230\u811a\u672c\u5e93\uff1a") + (To-RelativePath $target)
})

$refreshScriptsButton.Add_Click({
  Refresh-ScriptList
  $status.Text = U "\u5df2\u5237\u65b0\u811a\u672c\u5e93"
})

$openScriptsButton.Add_Click({
  if (-not (Test-Path $savedDir)) {
    New-Item -ItemType Directory -Path $savedDir | Out-Null
  }
  Start-Process explorer.exe -ArgumentList @($savedDir)
})

$deleteScriptButton.Add_Click({
  if (-not $scriptList.SelectedItem) {
    return
  }
  $relative = $scriptMap[[string]$scriptList.SelectedItem]
  if (-not $relative.StartsWith("tests\saved-flows\")) {
    [System.Windows.Forms.MessageBox]::Show((U "\u53ea\u80fd\u5220\u9664\u811a\u672c\u5e93\u91cc\u7684\u5df2\u4fdd\u5b58\u811a\u672c\u3002"), (U "\u4e0d\u53ef\u5220\u9664")) | Out-Null
    return
  }
  $fullPath = Join-Path $root $relative
  $confirm = [System.Windows.Forms.MessageBox]::Show((U "\u786e\u8ba4\u5220\u9664\u9009\u4e2d\u811a\u672c\uff1f"), (U "\u5220\u9664\u811a\u672c"), [System.Windows.Forms.MessageBoxButtons]::YesNo)
  if ($confirm -eq [System.Windows.Forms.DialogResult]::Yes) {
    Remove-Item -LiteralPath $fullPath -Force
    Refresh-ScriptList
    $status.Text = U "\u5df2\u5220\u9664\u811a\u672c"
  }
})

$sameTabTemplateButton.Add_Click({
  $target = Write-TemplateScript -FileName "template-same-tab-multi-url.spec.ts" -Content (Get-SameTabTemplate)
  if ($target) {
    Refresh-ScriptList
    $status.Text = (U "\u5df2\u751f\u6210\u6a21\u677f\uff1a") + (To-RelativePath $target)
  }
})

$multiTabsTemplateButton.Add_Click({
  $target = Write-TemplateScript -FileName "template-multi-tabs.spec.ts" -Content (Get-MultiTabsTemplate)
  if ($target) {
    Refresh-ScriptList
    $status.Text = (U "\u5df2\u751f\u6210\u6a21\u677f\uff1a") + (To-RelativePath $target)
  }
})

$popupTemplateButton.Add_Click({
  $target = Write-TemplateScript -FileName "template-popup-window.spec.ts" -Content (Get-PopupTemplate)
  if ($target) {
    Refresh-ScriptList
    $status.Text = (U "\u5df2\u751f\u6210\u6a21\u677f\uff1a") + (To-RelativePath $target)
  }
})

$clipboardTemplateButton.Add_Click({
  $target = Write-TemplateScript -FileName "template-read-clipboard.spec.ts" -Content (Get-ClipboardTemplate)
  if ($target) {
    Refresh-ScriptList
    $status.Text = (U "\u5df2\u751f\u6210\u6a21\u677f\uff1a") + (To-RelativePath $target)
  }
})

$saveClipboardButton.Add_Click({
  try {
    $target = Save-CurrentClipboardToCsv
    $status.Text = (U "\u5df2\u4fdd\u5b58\u526a\u8d34\u677f\uff1a") + (To-RelativePath $target)
  } catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, (U "\u526a\u8d34\u677f\u4fdd\u5b58\u5931\u8d25")) | Out-Null
  }
})

$openClipboardCsvButton.Add_Click({
  $target = Join-Path $root "output\clipboard\clipboard-captures.csv"
  if (-not (Test-Path $target)) {
    [System.Windows.Forms.MessageBox]::Show((U "\u8fd8\u6ca1\u6709\u526a\u8d34\u677f CSV\uff0c\u5148\u70b9\u4fdd\u5b58\u5f53\u524d\u526a\u8d34\u677f\u3002"), (U "\u6587\u4ef6\u4e0d\u5b58\u5728")) | Out-Null
    return
  }
  Start-Process explorer.exe -ArgumentList @("/select,", $target)
})

$browseVideoButton.Add_Click({
  Select-VideoFile
})

$includeTextCheckBox.Add_CheckedChanged({
  Sync-IncludeTextOption -Checked $includeTextCheckBox.Checked
})

$mainIncludeTextCheckBox.Add_CheckedChanged({
  Sync-IncludeTextOption -Checked $mainIncludeTextCheckBox.Checked
})

$startMonitorButton.Add_Click({
  Start-ActionMonitor -IncludeText $includeTextCheckBox.Checked
})

$openMonitorDirButton.Add_Click({
  Open-RepoDirectory $recordingPackageRoot
})

$openVideoIntakeDirButton.Add_Click({
  Open-RepoDirectory $recordingPackageRoot
})

$importVideoButton.Add_Click({
  Import-VideoIntake -VideoPath $videoPathBox.Text
})

$mainRefreshProfilesButton.Add_Click({
  Refresh-ProfileList
})

$mainStartMonitorButton.Add_Click({
  Start-ActionMonitor -IncludeText $mainIncludeTextCheckBox.Checked
})

$mainBrowseVideoButton.Add_Click({
  Select-VideoFile
})

$mainImportVideoButton.Add_Click({
  Import-VideoIntake -VideoPath $mainVideoPathBox.Text
})

$mainOpenMonitorDirButton.Add_Click({
  Open-RepoDirectory $recordingPackageRoot
})

$mainOpenVideoIntakeDirButton.Add_Click({
  Open-RepoDirectory $recordingPackageRoot
})

$openLibraryButton.Add_Click({
  Open-ScriptLibraryDialog
})

$appendSelectedButton.Add_Click({
  $scriptRelative = Get-SelectedScriptRelative
  if ([string]::IsNullOrWhiteSpace($scriptRelative)) {
    [System.Windows.Forms.MessageBox]::Show((U "\u8bf7\u5148\u4ece\u811a\u672c\u5e93\u9009\u4e2d\u4e00\u4e2a\u811a\u672c\uff0c\u518d\u7eed\u5f55\u3002"), (U "\u672a\u9009\u811a\u672c")) | Out-Null
    return
  }

  $targetPath = Join-Path $root $scriptRelative
  if (-not (Test-Path $targetPath)) {
    [System.Windows.Forms.MessageBox]::Show((U "\u9009\u4e2d\u811a\u672c\u4e0d\u5b58\u5728\uff0c\u8bf7\u5148\u5237\u65b0\u811a\u672c\u5e93\u3002"), (U "\u811a\u672c\u4e0d\u5b58\u5728")) | Out-Null
    return
  }

  $confirm = [System.Windows.Forms.MessageBox]::Show(
    ((U "\u5c06\u5f00\u59cb\u7ed9\u8fd9\u4e2a\u811a\u672c\u7eed\u5f55\uff1a") + [Environment]::NewLine + $scriptRelative + [Environment]::NewLine + [Environment]::NewLine + (U "\u7ed3\u675f\u540e\u4f1a\u5728\u5f55\u5c4f\u5305\u91cc\u9644\u5e26\u539f\u811a\u672c\uff0c\u65b9\u4fbf\u6211\u76f4\u63a5\u5f80\u540e\u8ffd\u52a0\u3002")),
    (U "\u7ee7\u7eed\u8ffd\u52a0"),
    [System.Windows.Forms.MessageBoxButtons]::OKCancel
  )
  if ($confirm -ne [System.Windows.Forms.DialogResult]::OK) {
    return
  }

  Start-ActionMonitor -IncludeText $mainIncludeTextCheckBox.Checked -AppendTargetRelative $scriptRelative
})

$modeButton.Add_Click({
  Set-AdvancedMode -Advanced $mainPanel.Visible
})

$openBallAction = {
  if ($script:ballDragMoved) {
    $script:ballDragMoved = $false
    return
  }
  Exit-BallMode
}

$ballStartDrag = {
  param($sender, $eventArgs)
  if ($eventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) {
    return
  }
  $script:ballMouseDownPoint = New-UiPoint $eventArgs.X $eventArgs.Y
  $script:ballDragMoved = $false
}

$ballMoveDrag = {
  param($sender, $eventArgs)
  if (-not $script:ballMouseDownPoint) {
    return
  }
  if (($eventArgs.Button -band [System.Windows.Forms.MouseButtons]::Left) -ne [System.Windows.Forms.MouseButtons]::Left) {
    return
  }
  $deltaX = [Math]::Abs($eventArgs.X - $script:ballMouseDownPoint.X)
  $deltaY = [Math]::Abs($eventArgs.Y - $script:ballMouseDownPoint.Y)
  if (($deltaX + $deltaY) -lt 4) {
    return
  }
  $script:ballMouseDownPoint = $null
  Start-BallNativeDrag
}

$ballEndDrag = {
  $script:ballMouseDownPoint = $null
}

$ballPanel.Add_Click($openBallAction)
$ballTitle.Add_Click($openBallAction)
$ballSubtitle.Add_Click($openBallAction)
$ballOpenMenuItem.Add_Click($openBallAction)
$ballExitMenuItem.Add_Click({
  $script:allowExit = $true
  $form.Close()
})

foreach ($control in @($ballPanel, $ballTitle, $ballSubtitle, $ballAccent)) {
  $control.Add_MouseDown($ballStartDrag)
  $control.Add_MouseMove($ballMoveDrag)
  $control.Add_MouseUp($ballEndDrag)
}

$refreshProfilesButton.Add_Click({
  Refresh-ProfileList
})

$scriptList.Add_SelectedIndexChanged({
  Update-MainSelectedScript
})

$runSelectedButton.Add_Click({
  $scriptRelative = Get-SelectedScriptRelative
  if ([string]::IsNullOrWhiteSpace($scriptRelative)) {
    [System.Windows.Forms.MessageBox]::Show((U "\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u811a\u672c\u3002"), (U "\u672a\u9009\u811a\u672c")) | Out-Null
    return
  }
  $profile = Get-SelectedProfile
  if ($null -eq $profile) {
    return
  }

  $command = "node tools\run-saved-flow-in-bitbrowser.mjs $(Quote-Pwsh $scriptRelative) $(Quote-Pwsh $profile.seq)"
  Start-RepoCommand -Command $command -Title "Run Flow In BitBrowser" -KeepOpen
  $status.Text = (U "\u5df2\u542f\u52a8\uff1a") + $scriptRelative + " -> seq " + $profile.seq
})

$form.Add_Shown({
  Refresh-ScriptList
  Update-MainSelectedScript
  Refresh-ProfileList
  Sync-IncludeTextOption -Checked $true
  Set-AdvancedMode -Advanced $false
  if ($StartInBall) {
    Enter-BallMode
  }
})

$form.Add_Resize({
  if ($form.WindowState -eq [System.Windows.Forms.FormWindowState]::Minimized -and -not $script:isBallMode) {
    $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
    Enter-BallMode
  }
})

$form.Add_FormClosing({
  param($sender, $eventArgs)
  if ($script:allowExit) {
    return
  }
  if ($floatingPanel.Visible) {
    return
  }
  $eventArgs.Cancel = $true
  Enter-BallMode
})

[void]$form.ShowDialog()
