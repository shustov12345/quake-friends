$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
foreach ($item in @(@('game.pid','vendor\ioq3ded.cjs'), @('server.pid','server.mjs'))) {
    $pidFile = Join-Path $project ('runtime\' + $item[0])
    if (Test-Path $pidFile) {
        $savedId = [int](Get-Content -LiteralPath $pidFile -Raw)
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$savedId"
        $expected = Join-Path $project $item[1]
        if ($processInfo -and $processInfo.CommandLine -like "*$expected*") {
            Stop-Process -Id $savedId -ErrorAction SilentlyContinue
        }
    }
}
Write-Host 'Quake Friends stopped.'
