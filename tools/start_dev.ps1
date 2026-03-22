$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$pythonExe = Join-Path $root ".venv\Scripts\python.exe"
$logDir = Join-Path $PSScriptRoot "logs"

if (-not (Test-Path $backendDir)) {
    throw "Backend folder not found: $backendDir"
}
if (-not (Test-Path $frontendDir)) {
    throw "Frontend folder not found: $frontendDir"
}
if (-not (Test-Path $pythonExe)) {
    throw "Python venv not found at $pythonExe"
}

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$npmCommand = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
if (-not $npmCommand) {
    $npmCommand = (Get-Command npm.exe -ErrorAction SilentlyContinue)
}
if (-not $npmCommand) {
    $npmCommand = (Get-Command npm -ErrorAction SilentlyContinue)
}
if (-not $npmCommand) {
    throw "npm not found in PATH. Install Node.js or add npm to PATH."
}

Write-Host "Starting FastAPI backend..."
$backendOutLog = Join-Path $logDir "backend.out.log"
$backendErrLog = Join-Path $logDir "backend.err.log"
$backendJobName = "hb-viewer-backend"
$frontendJobName = "hb-viewer-frontend"

foreach ($existingJob in (Get-Job -Name $backendJobName, $frontendJobName -ErrorAction SilentlyContinue)) {
    if ($null -eq $existingJob) {
        continue
    }

    if ($existingJob.State -eq "Running") {
        Stop-Job -Job $existingJob -ErrorAction SilentlyContinue | Out-Null
    }
    Remove-Job -Job $existingJob -Force -ErrorAction SilentlyContinue | Out-Null
}

$backendJob = Start-Job -Name $backendJobName -ScriptBlock {
    param($workingDir, $pythonPath, $stdoutPath, $stderrPath)

    Set-Location $workingDir
    & $pythonPath -m uvicorn app.main:app --reload --port 8000 1> $stdoutPath 2> $stderrPath
} -ArgumentList $backendDir, $pythonExe, $backendOutLog, $backendErrLog

Write-Host "Starting React frontend..."
$frontendOutLog = Join-Path $logDir "frontend.out.log"
$frontendErrLog = Join-Path $logDir "frontend.err.log"
$frontendJob = Start-Job -Name $frontendJobName -ScriptBlock {
    param($workingDir, $npmPath, $stdoutPath, $stderrPath)

    Set-Location $workingDir
    & $npmPath run dev 1> $stdoutPath 2> $stderrPath
} -ArgumentList $frontendDir, $npmCommand.Source, $frontendOutLog, $frontendErrLog

Write-Host "Backend Job: $($backendJob.Id) (http://127.0.0.1:8000)"
Write-Host "Frontend Job: $($frontendJob.Id) (http://localhost:5173)"
Write-Host "Use Stop-Job -Id <JOB_ID> to stop a server, then Remove-Job -Id <JOB_ID> to clean it up."
Write-Host "Logs: $backendOutLog, $backendErrLog, $frontendOutLog, $frontendErrLog"