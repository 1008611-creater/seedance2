param(
  [string]$MainAppDir = "D:\codex-work\seedance2",
  [string]$ProxyDir = "D:\codex-work\seedance2-video-api",
  [string]$UpstreamDir = "D:\codex-work\wangchuxiaoji-doubao2api",
  [int]$MainPort = 3012,
  [int]$ProxyPort = 7872,
  [int]$UpstreamPort = 9090,
  [string[]]$ExtraUpstreamPorts = @(),
  [switch]$RestartProxy,
  [switch]$RestartUpstreams,
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"

function Test-ListenPort {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-ListenPortOwners {
  param([int]$Port)
  return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique)
}

function Convert-PortList {
  param([string[]]$Values)
  $ports = @()
  foreach ($value in $Values) {
    if ($null -eq $value) { continue }
    foreach ($part in ([string]$value -split ",")) {
      $text = $part.Trim()
      if (!$text) { continue }
      $port = 0
      if (![int]::TryParse($text, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
        throw "Invalid upstream port: $text"
      }
      $ports += $port
    }
  }
  return @($ports | Select-Object -Unique)
}

function Wait-ListenPort {
  param([int]$Port, [string]$Name)
  for ($i = 0; $i -lt 60; $i++) {
    if (Test-ListenPort $Port) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "$Name did not start on port $Port."
}

function Stop-ListenPortOwners {
  param([int]$Port, [string]$Name)
  if (!(Test-ListenPort $Port)) { return }

  foreach ($ownerPid in (Get-ListenPortOwners $Port)) {
    Write-Host "restarting $Name on $Port (PID $ownerPid)"
    Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
  }

  for ($i = 0; $i -lt 30; $i++) {
    if (!(Test-ListenPort $Port)) { return }
    Start-Sleep -Milliseconds 500
  }

  throw "$Name did not stop on port $Port."
}

function Ensure-Directory {
  param([string]$Path)
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Set-ScopedEnvironment {
  param([hashtable]$Values)
  $previous = @{}
  foreach ($key in $Values.Keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
    [Environment]::SetEnvironmentVariable($key, [string]$Values[$key], "Process")
  }
  return $previous
}

function Restore-ScopedEnvironment {
  param([hashtable]$Previous)
  foreach ($key in $Previous.Keys) {
    [Environment]::SetEnvironmentVariable($key, $Previous[$key], "Process")
  }
}

function Start-StackProcess {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory,
    [hashtable]$Environment
  )

  if (!(Test-Path -LiteralPath $WorkingDirectory)) {
    throw "Missing working directory for ${Name}: $WorkingDirectory"
  }

  $logDir = Join-Path $WorkingDirectory ".logs"
  Ensure-Directory $logDir
  $stdout = Join-Path $logDir "$Name.out.log"
  $stderr = Join-Path $logDir "$Name.err.log"
  $previous = Set-ScopedEnvironment $Environment

  try {
    $process = Start-Process `
      -FilePath $FilePath `
      -ArgumentList $ArgumentList `
      -WorkingDirectory $WorkingDirectory `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr `
      -PassThru

    [pscustomobject]@{
      Name = $Name
      Pid = $process.Id
      Log = $stdout
      ErrorLog = $stderr
    }
  } finally {
    Restore-ScopedEnvironment $previous
  }
}

$started = @()
$extraPorts = Convert-PortList $ExtraUpstreamPorts
$allUpstreamPorts = @($UpstreamPort) + @($extraPorts | Where-Object { $_ -ne $UpstreamPort })

if ($RestartUpstreams) {
  foreach ($port in $allUpstreamPorts) {
    $accountId = if ($port -eq $UpstreamPort) { "main" } else { "acct-$port" }
    Stop-ListenPortOwners $port "doubao2api upstream $accountId"
  }
}

foreach ($port in $allUpstreamPorts) {
  $accountId = if ($port -eq $UpstreamPort) { "main" } else { "acct-$port" }
  $browserData = if ($port -eq $UpstreamPort) { ".browser_data" } else { ".browser_data_$port" }

  if (Test-ListenPort $port) {
    Write-Host "doubao2api upstream $accountId already listens on $port"
  } else {
    $started += Start-StackProcess `
      -Name "doubao2api-upstream-$accountId" `
      -FilePath $Python `
      -ArgumentList @("-m", "doubao2api") `
      -WorkingDirectory $UpstreamDir `
      -Environment @{
        DOUBAO_HOST = "127.0.0.1"
        DOUBAO_PORT = $port
        DOUBAO_HEADLESS = "true"
        DOUBAO_BROWSER_DATA = (Join-Path $UpstreamDir $browserData)
        DOUBAO_RPM_LIMIT = "3"
      }
    Wait-ListenPort $port "doubao2api upstream $accountId"
  }
}

$upstreamPool = ($allUpstreamPorts | ForEach-Object {
  $accountId = if ($_ -eq $UpstreamPort) { "main" } else { "acct-$_" }
  "$accountId=http://127.0.0.1:$_/v1"
}) -join ";"

if ($RestartProxy -and (Test-ListenPort $ProxyPort)) {
  Stop-ListenPortOwners $ProxyPort "seedance2-video-api proxy"
}

if (Test-ListenPort $ProxyPort) {
  Write-Host "seedance2-video-api proxy already listens on $ProxyPort"
} else {
  $started += Start-StackProcess `
    -Name "seedance2-video-api" `
    -FilePath "node" `
    -ArgumentList @("src/server/app.cjs") `
    -WorkingDirectory $ProxyDir `
    -Environment @{
      PORT = $ProxyPort
      DOUBAO2API_BASE_URL = "http://127.0.0.1:$UpstreamPort/v1"
      DOUBAO2API_UPSTREAMS = $upstreamPool
      DOUBAO2API_TIMEOUT_MS = "180000"
      DOUBAO2API_RATE_LIMIT_COOLDOWN_MS = "1800000"
      DOUBAO2API_LOGIN_REQUIRED_COOLDOWN_MS = "60000"
      DOUBAO2API_MIN_INTERVAL_MS = "120000"
      DOUBAO2API_QUEUE_TIMEOUT_MS = "5000"
    }
  Wait-ListenPort $ProxyPort "seedance2-video-api proxy"
}

if (Test-ListenPort $MainPort) {
  Write-Host "main app already listens on $MainPort"
} else {
  $started += Start-StackProcess `
    -Name "seedance2-main-app" `
    -FilePath "cmd.exe" `
    -ArgumentList @("/d", "/s", "/c", "node_modules\.bin\next.cmd dev -p $MainPort") `
    -WorkingDirectory $MainAppDir `
    -Environment @{
      VIDEO_PROVIDER = "doubao2api"
      DOUBAO2API_PROXY_BASE_URL = "http://127.0.0.1:$ProxyPort/v1"
      DOUBAO2API_TIMEOUT_MS = "180000"
    }
  Wait-ListenPort $MainPort "main app"
}

Write-Host ""
Write-Host "doubao2api stack is ready:"
Write-Host "  upstreams: $upstreamPool"
Write-Host "  proxy:    http://127.0.0.1:$ProxyPort"
Write-Host "  app:      http://127.0.0.1:$MainPort"

if ($started.Count) {
  Write-Host ""
  Write-Host "Started processes:"
  $started | Format-Table -AutoSize
}
