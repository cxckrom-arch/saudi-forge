param(
    [string]$ProjectRoot = "",
    [int]$Port = 3001,
    [switch]$SkipBootstrap
)
$ErrorActionPreference = "Stop"
$DefaultKromHome = "C:\KSA-FORGE"
if (-not $env:KROM_HOME) { $env:KROM_HOME = $DefaultKromHome }
if (-not (Test-Path $env:KROM_HOME)) {
    Write-Warning "KROM_HOME '$env:KROM_HOME' was not found. Falling back to script folder."
    $env:KROM_HOME = $PSScriptRoot
}
Set-Location $env:KROM_HOME
if ($ProjectRoot) { $env:KROM_PROJECT_ROOT = $ProjectRoot }
elseif (-not $env:KROM_PROJECT_ROOT) { $env:KROM_PROJECT_ROOT = $env:KROM_HOME }
$env:PORT = "$Port"

if (-not $SkipBootstrap -and ((-not (Test-Path '.\package.json')) -or (-not (Test-Path '.\node_modules')))) {
    Write-Host "[KSA] Runtime is incomplete. Running bootstrap..."
    & (Join-Path $PSScriptRoot 'BOOTSTRAP-SAUDI-FORGE.ps1') -KromHome $env:KROM_HOME -ProjectRoot $env:KROM_PROJECT_ROOT -Port $Port -InstallDependencies
}

$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    throw "Port $Port is already in use by PID $($conn[0].OwningProcess). Choose another port: .\START-SAUDI-FORGE.ps1 -Port 3002"
}

Write-Host "KROM_HOME         = $env:KROM_HOME"
Write-Host "KROM_PROJECT_ROOT = $env:KROM_PROJECT_ROOT"
Write-Host "PORT              = $env:PORT"
Write-Host "IDE               = http://127.0.0.1:$Port/ide"
Write-Host "MCP               = http://127.0.0.1:$Port/mcp"

npm run dev
