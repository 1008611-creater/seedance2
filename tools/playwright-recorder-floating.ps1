param(
  [switch]$SmokeTest
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$defaultOutput = "tests\recorded-flow.spec.ts"
$savedDir = Join-Path $root "tests\saved-flows"

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

[System.Windows.Forms.Application]::EnableVisualStyles()

$fontName = "Microsoft YaHei UI"
$scriptMap = @{}
$profileMap = @{}

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
  $Button.FlatAppearance.BorderSize = 1
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
  for ($i = 0; $i -lt $Urls.Count; $i += 1) {
    $number = $i + 1
    $encodedUrl = Escape-Html $Urls[$i]
    [void]$items.AppendLine("<section class=""target"">")
    [void]$items.AppendLine("  <div class=""meta"">网址 $number</div>")
    [void]$items.AppendLine("  <code>$encodedUrl</code>")
    [void]$items.AppendLine("  <div class=""actions"">")
    [void]$items.AppendLine("    <a class=""primary"" href=""$encodedUrl"">同标签打开 $number</a>")
    [void]$items.AppendLine("    <a href=""$encodedUrl"" target=""_blank"">新标签打开 $number</a>")
    [void]$items.AppendLine("  </div>")
    [void]$items.AppendLine("</section>")
  }

  $html = @"
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>多网址录制导航</title>
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
    <h1>多网址录制导航</h1>
    <p>录制器会从这里开始。需要保留多个页面时点“新标签打开”；需要同一个页面连续跳转时点“同标签打开”。</p>
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
$form.ClientSize = New-UiSize 820 724
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
$runPanel.Size = New-UiSize 386 114
$runPanel.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($runPanel)

Add-Label $runPanel (U "\u6267\u884c") 16 12 120 22 10.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
Add-Label $runPanel (U "\u628a\u811a\u672c\u5e93\u91cc\u7684\u811a\u672c\u5e94\u7528\u5230\u53f3\u4fa7\u9009\u4e2d\u7684\u6307\u7eb9\u6d4f\u89c8\u5668\u7a97\u53e3\u3002") 16 40 354 20 8.5 ([System.Drawing.FontStyle]::Regular) (New-UiColor 100 116 139) | Out-Null
$runSelectedButton = Add-Button $runPanel (U "\u5e94\u7528\u5230\u6240\u9009\u7a97\u53e3") 16 70 354 32 $true

$templatePanel = New-Object System.Windows.Forms.Panel
$templatePanel.Location = New-UiPoint 14 540
$templatePanel.Size = New-UiSize 792 128
$templatePanel.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($templatePanel)

Add-Label $templatePanel (U "\u6a21\u677f\u4e0e\u526a\u8d34\u677f") 16 12 180 22 10.5 ([System.Drawing.FontStyle]::Bold) (New-UiColor 15 23 42) | Out-Null
Add-Label $templatePanel (U "\u751f\u6210\u591a\u7f51\u5740\u6d41\u7a0b\u6a21\u677f\uff0c\u6216\u628a\u5f53\u524d\u526a\u8d34\u677f\u6587\u672c\u4fdd\u5b58\u5230 CSV\u3002") 190 14 570 20 8.5 ([System.Drawing.FontStyle]::Regular) (New-UiColor 100 116 139) | Out-Null

$sameTabTemplateButton = Add-Button $templatePanel (U "\u540c\u6807\u7b7e\u591a\u7f51\u5740") 16 50 178 28
$multiTabsTemplateButton = Add-Button $templatePanel (U "\u591a\u6807\u7b7e\u9875") 204 50 178 28
$popupTemplateButton = Add-Button $templatePanel (U "\u5f39\u7a97/\u65b0\u7a97\u53e3") 392 50 178 28
$clipboardTemplateButton = Add-Button $templatePanel (U "\u8bfb\u526a\u8d34\u677f\u6a21\u677f") 580 50 196 28
$saveClipboardButton = Add-Button $templatePanel (U "\u4fdd\u5b58\u5f53\u524d\u526a\u8d34\u677f") 16 88 178 28 $true
$openClipboardCsvButton = Add-Button $templatePanel (U "\u6253\u5f00\u526a\u8d34\u677f CSV") 204 88 178 28

$status = New-Object System.Windows.Forms.Label
$status.Text = U "\u5c31\u7eea\uff1a\u5148\u5f55\u5236\u6216\u9009\u62e9\u5df2\u4fdd\u5b58\u7684\u811a\u672c"
$status.ForeColor = New-UiColor 51 65 85
$status.Location = New-UiPoint 22 684
$status.Size = New-UiSize 760 24
$status.Font = New-UiFont 9
$form.Controls.Add($status)

function Refresh-ScriptList {
  $scriptList.Items.Clear()
  $scriptMap.Clear()

  $candidates = @()
  $recordedPath = Join-Path $root $defaultOutput
  if (Test-Path $recordedPath) {
    $candidates += Get-Item -LiteralPath $recordedPath
  }
  if (Test-Path $savedDir) {
    $candidates += Get-ChildItem -LiteralPath $savedDir -Filter "*.spec.ts" | Sort-Object LastWriteTime -Descending
  }

  foreach ($item in $candidates) {
    $relative = To-RelativePath $item.FullName
    $display = "{0}  |  {1} bytes  |  {2}" -f $relative, $item.Length, $item.LastWriteTime.ToString("MM-dd HH:mm")
    [void]$scriptList.Items.Add($display)
    $scriptMap[$display] = $relative
  }

  if ($scriptList.Items.Count -gt 0) {
    $scriptList.SelectedIndex = 0
  }
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

$refreshProfilesButton.Add_Click({
  Refresh-ProfileList
})

$runSelectedButton.Add_Click({
  if (-not $scriptList.SelectedItem) {
    [System.Windows.Forms.MessageBox]::Show((U "\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u811a\u672c\u3002"), (U "\u672a\u9009\u811a\u672c")) | Out-Null
    return
  }
  if (-not $profileList.SelectedItem) {
    [System.Windows.Forms.MessageBox]::Show((U "\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u6bd4\u7279\u6d4f\u89c8\u5668\u7a97\u53e3\u3002"), (U "\u672a\u9009\u7a97\u53e3")) | Out-Null
    return
  }

  $scriptRelative = $scriptMap[[string]$scriptList.SelectedItem]
  $profile = $profileMap[[string]$profileList.SelectedItem]
  if ($profile.status -ne 1) {
    [System.Windows.Forms.MessageBox]::Show((U "\u8bf7\u9009\u62e9\u8fd0\u884c\u4e2d\u7684\u6bd4\u7279\u6d4f\u89c8\u5668\u7a97\u53e3\u3002"), (U "\u7a97\u53e3\u672a\u8fd0\u884c")) | Out-Null
    return
  }

  $command = "node tools\run-saved-flow-in-bitbrowser.mjs $(Quote-Pwsh $scriptRelative) $(Quote-Pwsh $profile.seq)"
  Start-RepoCommand -Command $command -Title "Run Flow In BitBrowser" -KeepOpen
  $status.Text = (U "\u5df2\u542f\u52a8\uff1a") + $scriptRelative + " -> seq " + $profile.seq
})

$form.Add_Shown({
  Refresh-ScriptList
  Refresh-ProfileList
})

[void]$form.ShowDialog()
