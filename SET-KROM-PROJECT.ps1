param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectPath
)

$resolved = [System.IO.Path]::GetFullPath($ProjectPath)
if (-not (Test-Path $resolved)) {
    throw "Project path not found: $resolved"
}
$env:KROM_PROJECT_ROOT = $resolved
Write-Host "KROM_PROJECT_ROOT set to: $env:KROM_PROJECT_ROOT"
