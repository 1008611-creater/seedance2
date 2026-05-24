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
$appName = U "Playwright\u5f55\u5236\u63a7\u5236\u53f0"
$desktopShortcut = Join-Path $desktop "$appName.lnk"
$startShortcut = Join-Path $startMenu "$appName.lnk"

if (-not (Test-Path $launcher)) {
  throw "Launcher not found: $launcher"
}

$shell = New-Object -ComObject WScript.Shell

foreach ($shortcutPath in @($desktopShortcut, $startShortcut)) {
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "wscript.exe"
  $shortcut.Arguments = "`"$launcher`""
  $shortcut.WorkingDirectory = $root
  $shortcut.WindowStyle = 1
  $shortcut.Description = U "\u6253\u5f00 Playwright \u5f55\u5236\u63a7\u5236\u53f0"
  $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,167"
  $shortcut.Save()
}

Write-Output (U "\u5df2\u5b89\u88c5\u684c\u9762\u548c\u5f00\u59cb\u83dc\u5355\u5feb\u6377\u65b9\u5f0f\uff1a") 
Write-Output $desktopShortcut
Write-Output $startShortcut

if ($StartAfterInstall) {
  Start-Process -FilePath "wscript.exe" -ArgumentList "`"$launcher`"" -WorkingDirectory $root
}
