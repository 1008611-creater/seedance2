$ErrorActionPreference = "Stop"

function U {
  param([Parameter(Mandatory = $true)][string]$Value)
  return [regex]::Replace($Value, '\\u([0-9a-fA-F]{4})', {
    param($Match)
    return [string][char][Convert]::ToInt32($Match.Groups[1].Value, 16)
  })
}

$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = [Environment]::GetFolderPath("Programs")
$startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$appName = U "Playwright\u5f55\u5236\u63a7\u5236\u53f0"
$ballName = U "\u811a\u672c\u5de5\u4f5c\u53f0\u60ac\u6d6e\u7403"
$paths = @(
  (Join-Path $desktop "$appName.lnk"),
  (Join-Path $startMenu "$appName.lnk"),
  (Join-Path $startup "$ballName.lnk")
)

foreach ($path in $paths) {
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path
    Write-Output (U "\u5df2\u5220\u9664\uff1a")$path
  }
}
