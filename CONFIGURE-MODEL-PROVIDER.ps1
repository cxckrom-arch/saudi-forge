param(
  [ValidateSet('ollama','gpt4all','gemini','openai-compatible','custom')][string]$Kind='ollama',
  [string]$BaseUrl='',
  [string]$ApiKeyEnv='',
  [string]$Model=''
)
$ErrorActionPreference='Stop'
$home='C:\KROM-FORGE'
if($env:KROM_HOME){$home=$env:KROM_HOME}
$state=Join-Path $home '.krom\v32-providers'
New-Item -ItemType Directory -Path $state -Force | Out-Null
if(-not $BaseUrl){
  if($Kind -eq 'ollama'){$BaseUrl='http://127.0.0.1:11434'}
  elseif($Kind -eq 'gpt4all'){$BaseUrl='http://127.0.0.1:4891'}
  elseif($Kind -eq 'gemini'){$BaseUrl='https://generativelanguage.googleapis.com/v1beta/openai'}
  else{throw 'Provide -BaseUrl for this provider kind.'}
}
if($Kind -eq 'gemini' -and -not $ApiKeyEnv){$ApiKeyEnv='GEMINI_API_KEY'}
Write-Host "Provider kind : $Kind"
Write-Host "Base URL      : $BaseUrl"
if($ApiKeyEnv){Write-Host "API key env   : $ApiKeyEnv (value is not stored)"}
if($Model){Write-Host "Default model : $Model"}
Write-Host 'Use provider_profile_upsert_v32 from KROM MCP to save the profile.'
