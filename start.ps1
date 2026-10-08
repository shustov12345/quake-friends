$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$node = (Get-Command node.exe -ErrorAction Stop).Source
$serverFile = Join-Path $project 'server.mjs'
$runtime = Join-Path $project 'runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
if (-not (Test-Path (Join-Path $project 'public\engine.js'))) { throw 'Run npm ci and npm run setup in this folder first.' }
$running = $false
$pidFile = Join-Path $runtime 'server.pid'
if (Test-Path $pidFile) {
    $savedId = [int](Get-Content -LiteralPath $pidFile -Raw)
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$savedId"
    $running = $processInfo -and $processInfo.CommandLine -like "*$serverFile*"
}
if (-not $running) {
    Start-Process -FilePath $node -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'server.log') -RedirectStandardError (Join-Path $runtime 'server-error.log') | Out-Null
}
Start-Process 'http://localhost:8088/'
Write-Host 'Quake Friends: http://localhost:8088/'
if (Test-Path (Join-Path $runtime 'settings.json')) {
    $settings = Get-Content -LiteralPath (Join-Path $runtime 'settings.json') -Raw | ConvertFrom-Json
    Write-Host ("Room password: " + $settings.password)
}
