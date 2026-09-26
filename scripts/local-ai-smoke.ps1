param(
  [string]$BaseUrl = 'http://127.0.0.1:8080/v1',
  [string]$Model = ''
)
$ErrorActionPreference='Stop'
$u=[Uri]$BaseUrl
if($u.Host -notin @('127.0.0.1','localhost','::1')){ throw 'Only loopback Local AI endpoints are allowed.' }
$models=Invoke-RestMethod -Method Get -Uri ($BaseUrl.TrimEnd('/') + '/models') -TimeoutSec 5
Write-Host 'Local AI /models: PASS'
$ids=@($models.data | ForEach-Object { $_.id })
$ids | ForEach-Object { Write-Host " - $_" }
if(-not $Model){ if($ids.Count -gt 0){ $Model=$ids[0] } else { Write-Host 'No model id returned; chat test skipped.'; exit 0 } }
$schema=@{
  type='object'; additionalProperties=$false; required=@('ok','message');
  properties=@{ ok=@{type='boolean'}; message=@{type='string';maxLength=80} }
}
$body=@{
  model=$Model
  messages=@(
    @{role='system';content='Return only JSON matching the requested schema.'},
    @{role='user';content='Respond that the local planner transport is ready.'}
  )
  temperature=0
  max_tokens=80
  stream=$false
  response_format=@{type='json_schema';schema=$schema}
  reasoning_effort='none'
  chat_template_kwargs=@{enable_thinking=$false}
} | ConvertTo-Json -Depth 12
$r=Invoke-RestMethod -Method Post -Uri ($BaseUrl.TrimEnd('/') + '/chat/completions') -ContentType 'application/json' -Body $body -TimeoutSec 60
if(-not $r.choices[0].message.content){ throw 'Chat completion returned no content.' }
Write-Host "Local AI schema chat: PASS ($Model)"
Write-Host $r.choices[0].message.content
