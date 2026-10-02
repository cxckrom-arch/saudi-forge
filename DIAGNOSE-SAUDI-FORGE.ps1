param([int]$Port = 3001)
$ErrorActionPreference = "Continue"
$kromHome = if ($env:KROM_HOME) { $env:KROM_HOME } else { "C:\SAUDI-FORGE" }
$project = if ($env:KROM_PROJECT_ROOT) { $env:KROM_PROJECT_ROOT } else { $kromHome }
Write-Host "KROM_HOME         : $kromHome"
Write-Host "KROM_PROJECT_ROOT : $project"
Write-Host "PORT              : $Port"
Write-Host "Node              : $(& node --version 2>$null)"
Write-Host "npm               : $(& npm --version 2>$null)"
Write-Host "Git               : $(& git --version 2>$null)"
Write-Host "server.ts         : $(Test-Path (Join-Path $kromHome 'server.ts'))"
Write-Host "package.json      : $(Test-Path (Join-Path $kromHome 'package.json'))"
Write-Host "node_modules      : $(Test-Path (Join-Path $kromHome 'node_modules'))"
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conn) { Write-Warning "Port $Port is already in use by PID $($conn[0].OwningProcess)." }
else { Write-Host "Port $Port          : AVAILABLE" }
