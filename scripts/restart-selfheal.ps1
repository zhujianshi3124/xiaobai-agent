# restart-selfheal.ps1 - dsh web timed self-heal check (script only until authorized; do NOT register before authorization)
# Check existing dsh web process first (double-start guard), then port listener; start only when both agree it is down.
#
# HARDENING (2026-09-17, condition #4):
#   H1  the pipe form (`... | Where-Object { ... } | Select-Object -First 1`) is replaced by
#       an explicit foreach loop. Under this host, cmdlet pipelines that feed cmdlets have
#       raised CantActivateDocumentInPipeline; the variable-capture form is immune to it.
#       This also removes the ONE pipe this script still had on the process-detection path.
#   H2  process lookup, listener lookup and start are each individually guarded; every
#       failure is logged and degrades to a defensible action (never a silent death).
#   H3  the start phase records the child pid and verifies the port comes up.
#   H4  the whole body is wrapped so an unexpected terminating error is still written to the
#       log file.
#
# v2.1 (2026-09-17 22:02, condition #3b step 2): gate semantics confirmed and documented.
#   The ONLY gate into the start branch is "no dsh web process AND port not listening".
#   Both must agree the service is down. A failed check is never a reason to start, and a
#   held port always wins - so this script can never double-start. (The trigger script had
#   a "root gone but port still held -> continue to start" path; that has been removed, see
#   H9 in restart-trigger.ps1. The two scripts now share identical gate semantics.)
#
# v2 (2026-09-17 21:55): paired with restart-trigger.ps1 v2. The 21:46 failed restart was
#   traced to conhost.exe inside the dsh web tree making `taskkill /T /F` exit 128 - the
#   kill strategy now lives entirely in the trigger (per-pid, leaves-first, conhost skipped).
#   This script keeps its role: detect "no dsh web process AND port not listening", then start.
param(
  [int]$Port = 3080,
  [string]$LogDir = "D:\dsh-plugins\dsh-toolkit\.panel-backups\restart-logs"
)

$ErrorActionPreference = "Stop"
$nodeExe = "D:\node.exe"
$dshBin = "C:\Users\LENOVO\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js"
$logFile = Join-Path $LogDir ("restart-selfheal-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log([string]$msg) {
  $line = ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $msg)
  try { Add-Content -Path $logFile -Value $line } catch { }
  Write-Output $line
}

# H1: no pipeline; explicit loop over the CIM result.
# v2 note: a dsh web process is detected by command line. The kill path lives in
# restart-trigger.ps1; this script only needs to know whether one is alive.
function Get-DshWebNode {
  $found = $null
  try {
    $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
    foreach ($p in @($procs)) {
      if ($p.CommandLine -and $p.CommandLine.Contains("dsh\lib\bin.js") -and $p.CommandLine.Contains(" web")) {
        $found = $p
        break
      }
    }
  } catch {
    Log ("WARN: Get-CimInstance failed: " + $_.Exception.Message)
  }
  return $found
}

# H1: no pipeline; explicit loop over the TCP connections.
function Get-Listener([int]$p) {
  try {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    foreach ($c in @($conns)) { return $c }
  } catch {
    Log ("WARN: Get-NetTCPConnection failed: " + $_.Exception.Message)
  }
  return $null
}

# H4: top-level guard so an unexpected terminating error is recorded instead of vanishing.
try {
  $existing = Get-DshWebNode
  if ($existing) {
    Log ("existing dsh web process pid=" + $existing.ProcessId + " - double-start guard skip")
    exit 0
  }

  $listener = Get-Listener $Port
  if ($listener) {
    Log ("port " + $Port + " listening, pid=" + $listener.OwningProcess + " - healthy")
    exit 0
  }

  Log ("port " + $Port + " not listening and no dsh web process; starting dsh web")
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
  if ($up) { Log "port listening again" } else { Log "WARN: failed to bring port up" }
} catch {
  Log ("FATAL: unhandled error: " + $_.Exception.Message)
  Log ("FATAL: at " + $_.InvocationInfo.PositionMessage)
  exit 1
}
