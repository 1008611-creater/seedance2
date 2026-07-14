param(
  [switch]$StartAfterInstall
)

$ErrorActionPreference = "Stop"

function U {
  param([Parameter(Mandatory = $true)][string]$Value)
  return [regex]::Replace($Value, '\\u([0-9a-fA-F]{4})', {
    param($Match)
    return [string][char][Convert]::ToInt32($Match.Groups[1].Value, 16)
  })
}

$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root "tools\playwright-recorder-launcher.vbs"
$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = [Environment]::GetFolderPath("Programs")
$startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$appName = U "Playwright\u5f55\u5236\u63a7\u5236\u53f0"
$ballName = U "\u811a\u672c\u5de5\u4f5c\u53f0\u60ac\u6d6e\u7403"
$desktopShortcut = Join-Path $desktop "$appName.lnk"
$startShortcut = Join-Path $startMenu "$appName.lnk"
$startupShortcut = Join-Path $startup "$ballName.lnk"

if (-not (Test-Path $launcher)) {
  throw "Launcher not found: $launcher"
}
if (-not (Test-Path $startup)) {
  New-Item -ItemType Directory -Path $startup -Force | Out-Null
}

$shell = New-Object -ComObject WScript.Shell

foreach ($shortcutPath in @($desktopShortcut, $startShortcut)) {
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "pythonw.exe"
  $shortcut.Arguments = "`"$root\tools\playwright-recorder-orb.py`""
  $shortcut.WorkingDirectory = $root
  $shortcut.WindowStyle = 1
  $shortcut.Description = U "\u6253\u5f00 Playwright \u811a\u672c\u5de5\u4f5c\u53f0\u60ac\u6d6e\u7403"
  $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,167"
  $shortcut.Save()
}

$startupBall = $shell.CreateShortcut($startupShortcut)
$startupBall.TargetPath = "pythonw.exe"
$startupBall.Arguments = "`"$root\tools\playwright-recorder-orb.py`""
$startupBall.WorkingDirectory = $root
$startupBall.WindowStyle = 1
$startupBall.Description = U "\u5f00\u673a\u542f\u52a8\u811a\u672c\u5de5\u4f5c\u53f0\u60ac\u6d6e\u7403"
$startupBall.IconLocation = "$env:SystemRoot\System32\shell32.dll,167"
$startupBall.Save()

Write-Output (U "\u5df2\u5b89\u88c5\u684c\u9762\u548c\u5f00\u59cb\u83dc\u5355\u5feb\u6377\u65b9\u5f0f\uff1a") 
Write-Output $desktopShortcut
Write-Output $startShortcut
Write-Output (U "\u5df2\u5b89\u88c5\u5f00\u673a\u60ac\u6d6e\u7403\uff1a")
Write-Output $startupShortcut

if ($StartAfterInstall) {
  Start-Process -FilePath "pythonw.exe" -ArgumentList "`"$root\tools\playwright-recorder-orb.py`"" -WorkingDirectory $root
}
