# restart-trigger.ps1 - dsh web timed restart trigger (script only; do NOT register before authorization)
# Plan: wait -> kill dsh web process tree (with cloudflared) -> wait port release -> start dsh web.
#
# HARDENING (2026-09-17, condition #4):
#   H1  external-command output is captured into a variable, never piped into ForEach-Object
#       (the previous pipe form raised CantActivateDocumentInPipeline under this host,
#        which aborted the script before any restart happened). Still relevant even though
#        the kill path no longer shells out: Start-Process/Get-* output is handled the same way.
#   H2  each phase is individually guarded: a failure in kill/wait/start is logged and
#       handled with a defensible action instead of dying silently.
#   H3  the kill phase is treated as failed ONLY when the ROOT pid is still alive after the
#       wait loop; nothing here trusts an external exit code.
#   H4  the whole body is wrapped so an unexpected terminating error is still written to the
#       log file (so a silent death can never repeat).
#
# HARDENING v2.1 (2026-09-17 22:02, condition #3b step 2) - gate semantics made explicit:
#   H9  THE ONLY GATE into the start branch is "port $Port is free".
#       A dead root pid is NOT a gate. Commit 054934e had a path where the root was gone
#       but the port was still held, and it logged a WARN then CONTINUED TO START - that
#       would double-start dsh web. Every not-released case now aborts with exit 1.
#       The gate is additionally re-asserted immediately before Start-Process so no future
#       edit can bypass it.
#       Rationale: a process error is not itself a reason to start (the old process may
#       still hold the port), and a dead process is not itself a reason to start either
#       (something else may hold it). Port freeness is the single necessary condition.
#
# HARDENING v2 (2026-09-17 22:00, condition #4b) - replace taskkill with Process.Kill():
#   H5  ROOT CAUSE of the 21:46 failed restart, established by direct access-mask probing:
#         taskkill.exe /PID x /F requests
#             PROCESS_TERMINATE | PROCESS_QUERY_INFORMATION   (0x0401)
#         our (non-elevated) token HOLDS   PROCESS_TERMINATE             (0x0001)  OK
#         our token is DENIED              PROCESS_QUERY_INFORMATION     (0x0400)  win32=5
#         and likewise DENIED              PROCESS_VM_READ               (0x0010)  win32=5
#       So taskkill refused with "拒绝访问" even though we could in fact terminate the
#       process. `taskkill /T` then abandoned the ROOT as well, and the server survived.
#       Evidence: _probe-accessmask-report.txt.
#   H6  the kill now uses .NET Process.Kill(), which requires only PROCESS_TERMINATE -
#       the right we genuinely hold. Verified working in _probe-killmethod-report.txt.
#       A per-pid try/catch means one protected member can never abort the whole tree.
#   H7  the tree is enumerated explicitly (Get-CimInstance by ParentProcessId) and killed
#       LEAVES-FIRST, so children release their handles before the parent goes away.
#   H8  success is judged by "is the ROOT pid gone and the port free", not by any exit code.
#
#   NOTE on a disproven hypothesis (kept so it is not re-litigated): an earlier theory held
#   that conhost.exe is inherently un-killable and poisons `taskkill /T`. A purpose-built
#   drill (_drill-p4b2-report.txt) put a real conhost into the root's subtree and
#   `taskkill /T /F` succeeded (exit 0). conhost is NOT the problem; the missing
#   PROCESS_QUERY_INFORMATION right is.
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

function Get-ProcessSnapshot {
  try { return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue) }
  catch { Log ("WARN: Get-CimInstance failed: " + $_.Exception.Message); return @() }
}

# H6: explicit recursive descent; leaves first. No pipeline, no /T.
function Get-DescendantPids([int]$RootPid, $Snapshot) {
  $ordered = New-Object System.Collections.Generic.List[int]
  $queue = New-Object System.Collections.Generic.Queue[int]
  $queue.Enqueue($RootPid)
  while ($queue.Count -gt 0) {
    $cur = $queue.Dequeue()
    foreach ($p in $Snapshot) {
      if ($p.ParentProcessId -eq $cur -and $p.ProcessId -ne $cur) {
        $queue.Enqueue([int]$p.ProcessId)
        $ordered.Insert(0, [int]$p.ProcessId)   # depth-first-ish: children go to the front => leaves first
      }
    }
  }
  return $ordered
}

function Test-PidAlive([int]$TargetPid) {
  try { return (@(Get-Process -Id $TargetPid -ErrorAction SilentlyContinue).Count -gt 0) } catch { return $false }
}

# H4: top-level guard so an unexpected terminating error is recorded instead of vanishing.
try {
  Log ("trigger scheduled, delay=" + $DelaySeconds + "s port=" + $Port)
  Start-Sleep -Seconds $DelaySeconds

  $listener = Get-Listener $Port
  if (-not $listener) {
    Log "no listener on port; entering start branch directly"
  } else {
    $rootPid = [int]$listener.OwningProcess
    Log ("killing process tree of pid " + $rootPid + " on port " + $Port)

    # H6/H7: enumerate the tree, then kill leaves-first via Process.Kill().
    $snapshot = Get-ProcessSnapshot
    $descendants = Get-DescendantPids -RootPid $rootPid -Snapshot $snapshot
    $killOrder = New-Object System.Collections.Generic.List[int]
    foreach ($d in $descendants) { $killOrder.Add($d) }
    $killOrder.Add($rootPid)   # root last

    Log ("tree members to kill (leaves first): " + ($killOrder -join ","))

    foreach ($targetPid in $killOrder) {
      $pinfo = $null
      foreach ($p in $snapshot) { if ($p.ProcessId -eq $targetPid) { $pinfo = $p; break } }
      $pname = if ($pinfo) { $pinfo.Name } else { "unknown" }

      try {
        # H6: Process.Kill() needs only PROCESS_TERMINATE, the right this token holds.
        # Using taskkill here is what broke the 21:46 attempt (see header H5).
        $proc = Get-Process -Id $targetPid -ErrorAction Stop
        $proc.Kill()
        Start-Sleep -Milliseconds 150
        $alive = (@(Get-Process -Id $targetPid -ErrorAction SilentlyContinue).Count -gt 0)
        Log ("kill pid " + $targetPid + " (" + $pname + ") via Process.Kill() -> alive=" + $alive)
      } catch {
        Log ("WARN: kill pid " + $targetPid + " (" + $pname + ") failed: " + $_.Exception.Message)
      }
    }

    # H3 + H8: wait for release; the hard criterion is that the ROOT pid is gone.
    $waited = 0
    $released = $false
    while ($waited -lt 60) {
      Start-Sleep -Seconds 2
      $waited += 2
      $listener = Get-Listener $Port
      if (-not $listener) { $released = $true; break }
      Log ("waiting port release, " + $waited + "s elapsed")
    }

    if (-not $released) {
      # GATE (v2.1): the ONLY legitimate trigger for the start branch is "port is free".
      # A dead root pid is NOT sufficient - if anything still listens on $Port, starting a
      # second dsh web would double-start. Refuse in every not-released case.
      $rootAlive = Test-PidAlive $rootPid
      $still = Get-Listener $Port
      $stillPid = if ($still) { $still.OwningProcess } else { "unknown" }
      Log ("ERROR: port " + $Port + " not free after 60s (root pid " + $rootPid + " alive=" + $rootAlive + ", listener pid=" + $stillPid + "); refusing to double-start")
      exit 1
    }
    Log "port free; starting dsh web"
  }

  # GATE (v2.1): re-assert the gate immediately before Start-Process, so no path can slip
  # through with the port still held (belt-and-braces against future edits).
  $finalCheck = Get-Listener $Port
  if ($finalCheck) {
    Log ("ERROR: gate violated at start time - port " + $Port + " still held by pid " + $finalCheck.OwningProcess + "; aborting before double-start")
    exit 1
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
  if ($up) {
    $l = Get-Listener $Port
    Log ("port " + $Port + " is listening again after restart (pid " + $l.OwningProcess + ")")
  }
  else { Log ("WARN: port " + $Port + " not listening within timeout; check self-heal task") }
} catch {
  Log ("FATAL: unhandled error: " + $_.Exception.Message)
  Log ("FATAL: at " + $_.InvocationInfo.PositionMessage)
  exit 1
}
