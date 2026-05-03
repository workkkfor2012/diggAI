$ErrorActionPreference = 'Stop'

$projectRoot = 'F:\work\github\diggAI'
Set-Location $projectRoot

$markdownMatches = Select-String -Path '.\src\shared\promptBuilder.js','.\src\content\content.js' -Pattern '```' -SimpleMatch
if ($markdownMatches) {
  throw 'Found Markdown code fence marker ``` in JS files. Stopping.'
}

node --check .\src\shared\promptBuilder.js
node --check .\src\content\content.js

Get-Content .\manifest.json | ConvertFrom-Json | Out-Null

Write-Host 'Firefox temporary add-on entry:'
Write-Host 'F:\work\github\diggAI\manifest.json'
