# restart-trigger.ps1 - dsh web timed restart trigger (script only; do NOT register before authorization)
# Plan: wait -> kill dsh web process tree (with cloudflared) -> wait port release -> start dsh web.
#
# HARDENING (2026-09-17, condition #4):
#   H1  taskkill output is captured into a variable, never piped into ForEach-Object
#       (the previous pipe form raised CantActivateDocumentInPipeline under this host,
#        which aborted the script before any restart happened).
#   H2  each phase is individually guarded: a failure in kill/wait/start is logged and
#       handled with a defensible action instead of dying silently.
#   H3  taskkill exit code is recorded; the kill phase is treated as failed ONLY when the
#       port is still held after the wait loop (refuse to double-start).
#   H4  the whole body is wrapped so an unexpected terminating error is still written to the
#       log file (so a silent death can never repeat).
param(
  [int]$DelaySeconds = 120,
  [int]$Port = 3080,
  [string]$LogDir = "D:\dsh-plugins\dsh-toolkit\.panel-backups\restart-logs"
)

$ErrorActionPreference = "Stop"
$nodeExe = "D:\node.exe"
$dshBin = "C:\Users\LENOVO\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js"
$logFile = Join-Path $LogDir ("restart-trigger-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log([string]$msg) {
  $line = ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $msg)
  try { Add-Content -Path $logFile -Value $line } catch { }
  Write-Output $line
}

function Get-Listener([int]$p) {
  try {
    return @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)[0]
  } catch {
    Log ("WARN: Get-NetTCPConnection failed: " + $_.Exception.Message)
    return $null
  }
}

# H4: top-level guard so an unexpected terminating error is recorded instead of vanishing.
try {
  Log ("trigger scheduled, delay=" + $DelaySeconds + "s port=" + $Port)
  Start-Sleep -Seconds $DelaySeconds

  $listener = Get-Listener $Port
  if (-not $listener) {
    Log "no listener on port; entering start branch directly"
  } else {
    $pidToKill = $listener.OwningProcess
    Log ("killing process tree of pid " + $pidToKill + " on port " + $Port)

    # H1 + H3: capture output into a variable; never pipe into ForEach-Object.
    try {
      $killOut = & taskkill.exe /PID $pidToKill /T /F 2>&1
      $killExit = $LASTEXITCODE
      foreach ($line in @($killOut)) { Log ("taskkill: " + $line) }
      Log ("taskkill exit=" + $killExit)
    } catch {
      Log ("WARN: taskkill invocation threw: " + $_.Exception.Message)
    }

    # H2: wait for release; "still held after 60s" is a hard abort (no double-start).
    $waited = 0
    $released = $false
    while ($waited -lt 60) {
      Start-Sleep -Seconds 2
      $waited += 2
      $listener = Get-Listener $Port
      if (-not $listener) { $released = $true; break }
      Log ("waiting port release, " + $waited + "s elapsed")
    }

    if ($released) {
      Log "port free; starting dsh web"
    } else {
      $still = Get-Listener $Port
      $stillPid = if ($still) { $still.OwningProcess } else { "unknown" }
      Log ("ERROR: port " + $Port + " still held by pid " + $stillPid + " after 60s; refusing to double-start")
      Log "abort: kill phase failed (see taskkill output above)"
      exit 1
    }
  }

  # H2: start phase guarded.
  try {
    $proc = Start-Process -FilePath $nodeExe -ArgumentList @($dshBin, "web") -PassThru -WindowStyle Hidden
    Log ("started pid " + $proc.Id)
  } catch {
    Log ("ERROR: Start-Process failed: " + $_.Exception.Message)
    exit 1
  }

  $up = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    $listener = Get-Listener $Port
    if ($listener) { $up = $true; break }
  }
  if ($up) { Log ("port " + $Port + " is listening again after restart") }
  else { Log ("WARN: port " + $Port + " not listening within timeout; check self-heal task") }
} catch {
  Log ("FATAL: unhandled error: " + $_.Exception.Message)
  Log ("FATAL: at " + $_.InvocationInfo.PositionMessage)
  exit 1
}
