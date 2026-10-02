param(
    [string]$KromHome = "C:\KSA-FORGE",
    [string]$ProjectRoot = "",
    [int]$Port = 3001,
    [switch]$InstallDependencies
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $KromHome)) {
    New-Item -ItemType Directory -Path $KromHome -Force | Out-Null
}
Set-Location $KromHome

if (-not $ProjectRoot) { $ProjectRoot = $KromHome }
$env:KROM_HOME = $KromHome
$env:KROM_PROJECT_ROOT = $ProjectRoot
$env:PORT = "$Port"

Write-Host "[KSA] Home    : $KromHome"
Write-Host "[KSA] Project : $ProjectRoot"
Write-Host "[KSA] Port    : $Port"

$node = Get-Command node -ErrorAction SilentlyContinue
$npm  = Get-Command npm  -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js is not installed or not in PATH." }
if (-not $npm)  { throw "npm is not installed or not in PATH." }

$nodeVersion = (& node --version).Trim()
$npmVersion = (& npm --version).Trim()
Write-Host "[PASS] Node $nodeVersion"
Write-Host "[PASS] npm  $npmVersion"

if (-not (Test-Path ".\package.json")) {
@'
{
  "name": "saudi-forge",
  "version": "32.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx server.ts",
    "start": "tsx server.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/fastify": "latest",
    "@modelcontextprotocol/node": "latest",
    "@modelcontextprotocol/server": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/node": "latest",
    "tsx": "latest",
    "typescript": "latest"
  }
}
'@ | Set-Content -Encoding UTF8 ".\package.json"
    Write-Host "[FIX] Created package.json"
}

if (-not (Test-Path ".\tsconfig.json")) {
@'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "types": ["node"],
    "strict": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "noEmit": true
  },
  "include": ["server.ts"]
}
'@ | Set-Content -Encoding UTF8 ".\tsconfig.json"
    Write-Host "[FIX] Created tsconfig.json"
}

New-Item -ItemType Directory -Path ".\.krom\logs" -Force | Out-Null
New-Item -ItemType Directory -Path ".\.krom\runtime" -Force | Out-Null

if ($InstallDependencies -or -not (Test-Path ".\node_modules")) {
    Write-Host "[KSA] Installing npm dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
}

Write-Host "[KROM] Running typecheck..."
npm run typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Typecheck still reports errors. Review them before production use."
}

Write-Host ""
Write-Host "Bootstrap complete. Start with:"
Write-Host "  .\START-SAUDI-FORGE.ps1"
