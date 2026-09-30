param(
  [string]$Model=''
)
$ErrorActionPreference='Stop'
$envName='GEMINI_API_KEY'
$baseUrl='https://generativelanguage.googleapis.com/v1beta/openai'
if(-not $env:GEMINI_API_KEY){
  Write-Warning 'GEMINI_API_KEY is not set in the current PowerShell session.'
  Write-Host 'Set it securely, for example: $env:GEMINI_API_KEY="YOUR_KEY"'
}
Write-Host 'Gemini provider configuration:'
Write-Host '  id        : gemini-google'
Write-Host '  kind      : gemini'
Write-Host "  baseUrl   : $baseUrl"
Write-Host "  apiKeyEnv : $envName"
if($Model){Write-Host "  model     : $Model"}
Write-Host ''
Write-Host 'In KROM MCP call provider_profile_upsert_v32 with:'
Write-Host '  name=Google Gemini, kind=gemini, baseUrl above, apiKeyEnv=GEMINI_API_KEY'
Write-Host 'Then run provider_health_v32 and model_discover_v32.'
