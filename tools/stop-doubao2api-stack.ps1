param(
  [string]$MainAppDir = "D:\codex-work\seedance2",
  [int[]]$Ports = @(3012, 7872, 9090, 9091, 9092)
)

$ErrorActionPreference = "Stop"
$allProcesses = @(Get-CimInstance Win32_Process)
$targets = @{}

function Add-Target {
  param([int]$ProcessId)
  if ($ProcessId -gt 0 -and $ProcessId -ne $PID) {
    $targets[$ProcessId] = $true
  }
}

function Find-Process {
  param([int]$ProcessId)
  return $allProcesses | Where-Object { $_.ProcessId -eq $ProcessId } | Select-Object -First 1
}

function Add-Descendants {
  param([int]$ProcessId)
  $children = @($allProcesses | Where-Object { $_.ParentProcessId -eq $ProcessId })
  foreach ($child in $children) {
    Add-Target $child.ProcessId
    Add-Descendants $child.ProcessId
  }
}

function Add-Related-Ancestors {
  param([int]$ProcessId)
  $cursor = Find-Process $ProcessId
  while ($cursor -and $cursor.ParentProcessId) {
    $parent = Find-Process $cursor.ParentProcessId
    if (!$parent) { break }

    $commandLine = [string]$parent.CommandLine
    $isRelated =
      $commandLine.Contains($MainAppDir) -or
      ($commandLine -like "*next*dev*-p*3012*")

    if (!$isRelated) { break }
    Add-Target $parent.ProcessId
    $cursor = $parent
  }
}

function Get-Depth {
  param([int]$ProcessId)
  $depth = 0
  $cursor = Find-Process $ProcessId
  while ($cursor -and $targets.ContainsKey([int]$cursor.ParentProcessId)) {
    $depth += 1
    $cursor = Find-Process $cursor.ParentProcessId
  }
  return $depth
}

foreach ($port in $Ports) {
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    Add-Target $listener.OwningProcess
    Add-Related-Ancestors $listener.OwningProcess
  }
}

foreach ($processId in @($targets.Keys)) {
  Add-Descendants ([int]$processId)
}

if (!$targets.Count) {
  Write-Host "No doubao2api stack listeners found."
  exit 0
}

$orderedTargets = $targets.Keys |
  ForEach-Object { [pscustomobject]@{ ProcessId = [int]$_; Depth = Get-Depth ([int]$_) } } |
  Sort-Object Depth -Descending

foreach ($target in $orderedTargets) {
  $process = Get-Process -Id $target.ProcessId -ErrorAction SilentlyContinue
  if (!$process) { continue }
  Write-Host "Stopping PID $($target.ProcessId) ($($process.ProcessName))"
  Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue
}
