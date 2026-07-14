$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$envFile = Join-Path $PSScriptRoot "production.env"
$hostName = if ($env:PICTURE_STUDIO_HOST) { $env:PICTURE_STUDIO_HOST } else { "127.0.0.1" }
$port = if ($env:PICTURE_STUDIO_PORT) { $env:PICTURE_STUDIO_PORT } else { "3013" }
$logDir = Join-Path $repoRoot ".tmp"
$logFile = Join-Path $logDir "picture-studio-next.log"
$nextBin = Join-Path $repoRoot "node_modules\next\dist\bin\next"
$buildDir = Join-Path $repoRoot ".next"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Import-DotEnvFile {
  param([string] $Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $match = [regex]::Match($trimmed, "^\s*([^#=\s]+)\s*=\s*(.*)\s*$")
    if (-not $match.Success) {
      continue
    }

    $name = $match.Groups[1].Value
    $value = $match.Groups[2].Value.Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

if (-not (Test-Path -LiteralPath $nextBin)) {
  throw "Missing Next.js binary at $nextBin. Run npm install first."
}

if (-not (Test-Path -LiteralPath $buildDir)) {
  throw "Missing production build at $buildDir. Run npm run build first."
}

Import-DotEnvFile -Path $envFile

if (-not $env:APP_URL) {
  $env:APP_URL = "https://picture.lsb0713.online"
}

$listener = Get-NetTCPConnection -LocalAddress $hostName -LocalPort ([int] $port) -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-Host "Picture studio is already listening on ${hostName}:$port."
  exit 0
}

Set-Location $repoRoot
Start-Transcript -Path $logFile -Append | Out-Null
try {
  Write-Host "Starting picture studio on http://${hostName}:$port"
  & node $nextBin start -H $hostName -p $port
} finally {
  Stop-Transcript | Out-Null
}
