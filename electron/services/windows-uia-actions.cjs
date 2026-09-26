const {runPowerShell}=require('./windows-inspector.cjs');
const {validateActionRequest,buildActionPlan,verifyTargetPinned}=require('./windows-action-policy.cjs');

function encode(value){return Buffer.from(JSON.stringify(value),'utf8').toString('base64');}
function arr(v){if(v==null)return[];return Array.isArray(v)?v:[v];}
function normalizeRect(r){if(!r)return null;return{left:Number(r.left||0),top:Number(r.top||0),width:Number(r.width||0),height:Number(r.height||0)};}
function normalizeElement(x={}){return{...x,processId:Number(x.processId||0),runtimeId:arr(x.runtimeId).map(Number).filter(Number.isFinite),isEnabled:Boolean(x.isEnabled),isOffscreen:Boolean(x.isOffscreen),isPassword:Boolean(x.isPassword),canScrollIntoView:Boolean(x.canScrollIntoView),rect:normalizeRect(x.rect)};}

function resolverScript(encoded,{execute=false}={}){return `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$reqJson=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))
$req=$reqJson | ConvertFrom-Json
function S($v){ if($null -eq $v){return ''}; return [string]$v }
function Elem($e,$w){
  $r=$e.Current.BoundingRectangle
  $rid=@();try{$rid=@($e.GetRuntimeId())}catch{}
  $isPassword=$false;try{$isPassword=[bool]$e.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)}catch{}
  $canScroll=$false;try{$sp=$e.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern);$canScroll=($null -ne $sp)}catch{}
  [ordered]@{name=$e.Current.Name;automationId=$e.Current.AutomationId;className=$e.Current.ClassName;controlType=$e.Current.ControlType.ProgrammaticName;frameworkId=$e.Current.FrameworkId;processId=$e.Current.ProcessId;isEnabled=$e.Current.IsEnabled;isOffscreen=$e.Current.IsOffscreen;isPassword=$isPassword;canScrollIntoView=$canScroll;runtimeId=$rid;windowName=$(if($w){$w.Current.Name}else{''});windowClassName=$(if($w){$w.Current.ClassName}else{''});rect=[ordered]@{left=$r.Left;top=$r.Top;width=$r.Width;height=$r.Height}}
}
function MatchText($actual,$expected){ return ([string]::IsNullOrEmpty((S $expected)) -or ((S $actual) -eq (S $expected))) }
function MatchElement($e,$s){
  if(($s.processId -as [int]) -gt 0 -and $e.Current.ProcessId -ne [int]$s.processId){return $false}
  if(!(MatchText $e.Current.AutomationId $s.automationId)){return $false}
  if(!(MatchText $e.Current.Name $s.name)){return $false}
  if(!(MatchText $e.Current.ClassName $s.className)){return $false}
  if(!(MatchText ($e.Current.ControlType.ProgrammaticName -replace '^ControlType\\.','') (($s.controlType|ForEach-Object{S $_}) -replace '^ControlType\\.',''))){return $false}
  if(!(MatchText $e.Current.FrameworkId $s.frameworkId)){return $false}
  return $true
}
$root=[System.Windows.Automation.AutomationElement]::RootElement
$tops=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$windows=New-Object System.Collections.Generic.List[object]
for($i=0;$i -lt $tops.Count;$i++){
  $w=$tops.Item($i)
  if(($req.selector.processId -as [int]) -gt 0 -and $w.Current.ProcessId -ne [int]$req.selector.processId){continue}
  if(!(MatchText $w.Current.Name $req.selector.windowName)){continue}
  if(!(MatchText $w.Current.ClassName $req.selector.windowClassName)){continue}
  $windows.Add($w)
}
$candidates=New-Object System.Collections.Generic.List[object]
$target=$null;$targetWindow=$null
foreach($w in $windows){
  if(MatchElement $w $req.selector){$candidates.Add([ordered]@{element=$w;window=$w})}
  $all=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
  for($j=0;$j -lt $all.Count;$j++){$e=$all.Item($j);if(MatchElement $e $req.selector){$candidates.Add([ordered]@{element=$e;window=$w});if($candidates.Count -gt 20){break}}}
  if($candidates.Count -gt 20){break}
}
if($candidates.Count -eq 1){$target=$candidates[0].element;$targetWindow=$candidates[0].window}
$rows=New-Object System.Collections.Generic.List[object]
foreach($c in $candidates){$rows.Add((Elem $c.element $c.window))}
if($null -eq $target){
  [ordered]@{supported=$true;ok=$false;code=$(if($candidates.Count -eq 0){'UIA_TARGET_NOT_FOUND'}else{'UIA_TARGET_AMBIGUOUS'});candidateCount=$candidates.Count;candidates=$rows}|ConvertTo-Json -Depth 8 -Compress;exit
}
$before=Elem $target $targetWindow
${execute?`
if($null -eq $req.expected){[ordered]@{supported=$true;ok=$false;code='UIA_EXPECTED_TARGET_REQUIRED';target=$before}|ConvertTo-Json -Depth 8 -Compress;exit}
$pinFields=@('processId','automationId','name','className','frameworkId','windowName','windowClassName')
$pinMismatch=New-Object System.Collections.Generic.List[string]
foreach($f in $pinFields){if((S $req.expected.$f) -ne (S $before.$f)){$pinMismatch.Add($f)}}
$expectedType=(S $req.expected.controlType) -replace '^ControlType\\.','';$beforeType=(S $before.controlType) -replace '^ControlType\\.','';if($expectedType -ne $beforeType){$pinMismatch.Add('controlType')}
$erid=@($req.expected.runtimeId);$brid=@($before.runtimeId);if($erid.Count -gt 0 -and $brid.Count -gt 0 -and (($erid -join ',') -ne ($brid -join ','))){$pinMismatch.Add('runtimeId')}
if($pinMismatch.Count -gt 0){[ordered]@{supported=$true;ok=$false;code='UIA_TARGET_CHANGED';mismatches=$pinMismatch;target=$before}|ConvertTo-Json -Depth 8 -Compress;exit}
if(!$target.Current.IsEnabled){[ordered]@{supported=$true;ok=$false;code='UIA_TARGET_DISABLED';target=$before}|ConvertTo-Json -Depth 8 -Compress;exit}
if([bool]$before.isPassword){[ordered]@{supported=$true;ok=$false;code='UIA_PASSWORD_CONTROL_BLOCKED';target=$before}|ConvertTo-Json -Depth 8 -Compress;exit}
$action=S $req.action
$allowed=@('focus','invoke','toggle','expand','collapse','scrollIntoView','setValue');if($allowed -notcontains $action){[ordered]@{supported=$true;ok=$false;code='UIA_ACTION_NOT_ALLOWED';target=$before}|ConvertTo-Json -Depth 8 -Compress;exit}
$verification=[ordered]@{ok=$false;mode='execution';detail=''}
try{
  switch($action){
    'focus' {$target.SetFocus();Start-Sleep -Milliseconds 80;$f=[System.Windows.Automation.AutomationElement]::FocusedElement;$fr=@();try{$fr=@($f.GetRuntimeId())}catch{};$verification.ok=(($brid.Count -eq 0) -or (($brid -join ',') -eq ($fr -join ',')));$verification.mode='focus';$verification.detail='FocusedElement checked'}
    'invoke' {$p=$target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern);if($null -eq $p){throw 'InvokePattern unavailable'};$p.Invoke();Start-Sleep -Milliseconds 120;$verification.ok=$true;$verification.mode='invoke-executed';$verification.detail='InvokePattern returned without error; semantic app outcome is not generically provable'}
    'toggle' {$p=$target.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern);if($null -eq $p){throw 'TogglePattern unavailable'};$pre=[string]$p.Current.ToggleState;$p.Toggle();Start-Sleep -Milliseconds 80;$p2=$target.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern);$post=[string]$p2.Current.ToggleState;$verification.ok=($pre -ne $post);$verification.mode='toggle-state';$verification.detail="$pre -> $post"}
    'expand' {$p=$target.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern);if($null -eq $p){throw 'ExpandCollapsePattern unavailable'};$p.Expand();Start-Sleep -Milliseconds 80;$p2=$target.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern);$post=[string]$p2.Current.ExpandCollapseState;$verification.ok=($post -match 'Expanded|PartiallyExpanded');$verification.mode='expand-state';$verification.detail=$post}
    'collapse' {$p=$target.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern);if($null -eq $p){throw 'ExpandCollapsePattern unavailable'};$p.Collapse();Start-Sleep -Milliseconds 80;$p2=$target.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern);$post=[string]$p2.Current.ExpandCollapseState;$verification.ok=($post -match 'Collapsed');$verification.mode='collapse-state';$verification.detail=$post}
    'scrollIntoView' {$p=$target.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern);if($null -eq $p){throw 'ScrollItemPattern unavailable'};$p.ScrollIntoView();Start-Sleep -Milliseconds 100;$afterScroll=Elem $target $targetWindow;$verification.ok=(-not [bool]$afterScroll.isOffscreen);$verification.mode='scroll-into-view';$verification.detail=$(if($verification.ok){'Target visible after ScrollIntoView'}else{'Target remains offscreen'})}
    'setValue' {$p=$target.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern);if($null -eq $p){throw 'ValuePattern unavailable'};if($p.Current.IsReadOnly){throw 'ValuePattern is read-only'};$p.SetValue([string]$req.value);Start-Sleep -Milliseconds 80;$p2=$target.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern);$actual=[string]$p2.Current.Value;$verification.ok=($actual -eq [string]$req.value);$verification.mode='value-equality';$verification.detail=$(if($verification.ok){'Value verified'}else{'Value mismatch'})}
  }
}catch{[ordered]@{supported=$true;ok=$false;code='UIA_ACTION_EXECUTION_FAILED';message=$_.Exception.Message;target=$before}|ConvertTo-Json -Depth 8 -Compress;exit}
$after=$null;try{$after=Elem $target $targetWindow}catch{}
[ordered]@{supported=$true;ok=[bool]$verification.ok;code=$(if($verification.ok){'UIA_ACTION_VERIFIED'}else{'UIA_ACTION_VERIFY_FAILED'});action=$action;before=$before;after=$after;verification=$verification}|ConvertTo-Json -Depth 8 -Compress
`:`[ordered]@{supported=$true;ok=$true;code='UIA_TARGET_RESOLVED';candidateCount=1;target=$before}|ConvertTo-Json -Depth 8 -Compress`}
`}

async function resolveWindowsUiTarget(input={}){
  const validated=validateActionRequest(input);if(!validated.ok)return{supported:process.platform==='win32',...validated};
  if(process.platform!=='win32')return{supported:false,platform:process.platform,ok:false,code:'UIA_WINDOWS_ONLY',reason:'Windows UI Automation actions are available only on Windows runtime.'};
  const payload={selector:validated.selector};const raw=await runPowerShell(resolverScript(encode(payload)),{timeout:25000});const data=JSON.parse(String(raw||'{}').replace(/:\s*-?(?:Infinity|NaN)/g,':0'));
  if(data.target)data.target=normalizeElement(data.target);data.candidates=arr(data.candidates).map(normalizeElement);return{platform:'win32',...data};
}

async function prepareWindowsUiAction(input={}){
  const validated=validateActionRequest(input);if(!validated.ok)return{supported:process.platform==='win32',...validated};
  const resolved=await resolveWindowsUiTarget(input);if(!resolved.ok)return resolved;
  const built=buildActionPlan(input,resolved.target);if(!built.ok)return{supported:true,platform:'win32',...built,target:resolved.target};
  return{supported:true,platform:'win32',ok:true,plan:built.plan,value:built.value,target:resolved.target};
}

async function executePinnedWindowsUiAction(plan,value=''){
  if(process.platform!=='win32')return{supported:false,platform:process.platform,ok:false,code:'UIA_WINDOWS_ONLY'};
  if(!plan?.selector||!plan?.target||!plan?.action)return{supported:true,platform:'win32',ok:false,code:'UIA_ACTION_PLAN_INVALID'};
  const request={selector:plan.selector,expected:plan.target,action:plan.action,value:plan.action==='setValue'?String(value??''):''};
  const raw=await runPowerShell(resolverScript(encode(request),{execute:true}),{timeout:25000});const data=JSON.parse(String(raw||'{}').replace(/:\s*-?(?:Infinity|NaN)/g,':0'));
  if(data.target)data.target=normalizeElement(data.target);if(data.before)data.before=normalizeElement(data.before);if(data.after)data.after=normalizeElement(data.after);
  if(data.before){const pinned=verifyTargetPinned(plan,data.before);if(!pinned.ok)return{supported:true,platform:'win32',ok:false,...pinned};}
  return{platform:'win32',...data};
}
module.exports={resolveWindowsUiTarget,prepareWindowsUiAction,executePinnedWindowsUiAction,normalizeElement,resolverScript};
