$ErrorActionPreference = "Stop"

$taskName = "Image2SceneCloudflaredTunnel"
$process = Get-Process cloudflared -ErrorAction SilentlyContinue

if ($process) {
  Write-Host "cloudflared is already running."
  exit 0
}

$result = Start-Process -FilePath schtasks.exe -ArgumentList @("/Run", "/TN", $taskName) -Wait -PassThru -WindowStyle Hidden
if ($result.ExitCode -ne 0) {
  throw "Failed to start scheduled task $taskName. Exit code: $($result.ExitCode)"
}

Start-Sleep -Seconds 6
$process = Get-Process cloudflared -ErrorAction SilentlyContinue
if (-not $process) {
  throw "cloudflared did not start after running $taskName."
}

Write-Host "cloudflared restarted."
