$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$logRoot = Join-Path $projectRoot 'var\logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (!(Test-Path $pythonPath)) {
    $pythonPath = (Get-Command python.exe).Source
    $bundledDeps = Join-Path (Split-Path $projectRoot) 'work\verified-deps'
    if (Test-Path $bundledDeps) { $env:PYTHONPATH = $bundledDeps }
}
if (!(Test-Path (Join-Path $projectRoot '.env'))) { throw 'Create .env first. See README.md.' }
if (!(Test-Path (Join-Path $projectRoot 'frontend\node_modules\vite'))) { throw 'Run npm.cmd ci --prefix frontend first.' }
$specs = @(
    @{Name='api'; File=$pythonPath; Args=@('-m','deploy.run_local'); Directory=$projectRoot; Port=8000},
    @{Name='web'; File=(Get-Command node.exe).Source; Args=@('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort'); Directory=(Join-Path $projectRoot 'frontend'); Port=5173},
    @{Name='worker'; File=$pythonPath; Args=@('-m','deploy.run_worker'); Directory=$projectRoot; Port=0}
)
foreach ($spec in $specs) {
    $pidFile = Join-Path $logRoot ($spec.Name+'.pid')
    if ($spec.Port -and (Get-NetTCPConnection -LocalPort $spec.Port -State Listen -ErrorAction SilentlyContinue)) {
        Write-Output "$($spec.Name) already listening on $($spec.Port)."
        continue
    }
    if (Test-Path $pidFile) {
        $savedPid = [int](Get-Content $pidFile)
        $running = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
        if ($running -and $running.CommandLine.Contains('deploy.run_worker') -and $spec.Name -eq 'worker') {
            Write-Output 'Worker already running.'
            continue
        }
    }
    $process = Start-Process -FilePath $spec.File -ArgumentList $spec.Args -WorkingDirectory $spec.Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot ($spec.Name+'.out.log')) -RedirectStandardError (Join-Path $logRoot ($spec.Name+'.err.log'))
    Set-Content -LiteralPath $pidFile -Value $process.Id
    Write-Output "$($spec.Name) started: $($process.Id)"
}
Write-Output 'App: http://127.0.0.1:5173 | API: http://127.0.0.1:8000/docs'
