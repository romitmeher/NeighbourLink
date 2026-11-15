$ErrorActionPreference = 'Stop'
$logRoot = Join-Path $PSScriptRoot 'var\logs'
foreach ($name in @('api','web','worker')) {
    $pidFile = Join-Path $logRoot ($name+'.pid')
    if (!(Test-Path $pidFile)) { continue }
    $savedPid = [int](Get-Content $pidFile)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
    $marker = switch ($name) { 'api' {'deploy.run_local'} 'worker' {'deploy.run_worker'} 'web' {'node_modules/vite/bin/vite.js'} }
    if ($process -and $process.CommandLine.Contains($marker)) {
        Stop-Process -Id $savedPid
        Write-Output "$name stopped."
    }
    Remove-Item -LiteralPath $pidFile
}
