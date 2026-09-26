const {runPowerShell}=require('./windows-inspector.cjs');
function clampInt(v,min,max,fallback){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.trunc(n))):fallback;}
function arr(v){if(v==null)return[];return Array.isArray(v)?v:[v];}
function normalizeRect(r){if(!r)return null;return{left:Number(r.left||0),top:Number(r.top||0),width:Number(r.width||0),height:Number(r.height||0)};}
function normalizeAncestor(x={}){return{name:String(x.name||''),automationId:String(x.automationId||''),className:String(x.className||''),controlType:String(x.controlType||''),frameworkId:String(x.frameworkId||'')};}
function normalizeElement(x={}){return{...x,processId:Number(x.processId||0),nativeWindowHandle:Number(x.nativeWindowHandle||0),runtimeId:arr(x.runtimeId).map(Number).filter(Number.isFinite),isEnabled:Boolean(x.isEnabled),isOffscreen:Boolean(x.isOffscreen),isPassword:Boolean(x.isPassword),hasKeyboardFocus:Boolean(x.hasKeyboardFocus),canScrollIntoView:Boolean(x.canScrollIntoView),surfaceIsModal:Boolean(x.surfaceIsModal),surfaceRect:normalizeRect(x.surfaceRect),rect:normalizeRect(x.rect),ancestors:arr(x.ancestors).map(normalizeAncestor).slice(0,6)};}
function normalizeDisplay(x={}){return{deviceName:String(x.deviceName||''),primary:Boolean(x.primary),bounds:normalizeRect(x.bounds),workingArea:normalizeRect(x.workingArea)};}
async function inspectWindowsUi({maxNodes=500,maxSurfaces=6}={}){
  if(process.platform!=='win32')return{supported:false,platform:process.platform,reason:'Windows UI Automation grounding is available only on Windows runtime.'};
  const limit=clampInt(maxNodes,25,1500,500),surfaceLimit=clampInt(maxSurfaces,1,12,6);
  const script=`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$focus=[System.Windows.Automation.AutomationElement]::FocusedElement
function Ancestors($e,$stop){
  $out=New-Object System.Collections.Generic.List[object]
  $p=[System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($e);$n=0
  while($null -ne $p -and $n -lt 6){
    if($null -ne $stop -and $p -eq $stop){break}
    $out.Add([ordered]@{name=$p.Current.Name;automationId=$p.Current.AutomationId;className=$p.Current.ClassName;controlType=$p.Current.ControlType.ProgrammaticName;frameworkId=$p.Current.FrameworkId})
    $p=[System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($p);$n++
  }
  return $out
}
function Modal($w){try{$p=$w.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern);return [bool]$p.Current.IsModal}catch{return $false}}
function ScrollItem($e){try{$p=$e.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern);return ($null -ne $p)}catch{return $false}}
function Elem($e,$surface){
  $r=$e.Current.BoundingRectangle;$rid=@();try{$rid=@($e.GetRuntimeId())}catch{}
  $isPassword=$false;try{$isPassword=[bool]$e.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)}catch{}
  $sr=$surface.Current.BoundingRectangle;$sk='window';$modal=Modal $surface
  if($modal){$sk='dialog'}elseif($surface.Current.ClassName -eq '#32768' -or $surface.Current.ControlType -eq [System.Windows.Automation.ControlType]::Menu){$sk='menu'}
  [ordered]@{name=$e.Current.Name;automationId=$e.Current.AutomationId;className=$e.Current.ClassName;controlType=$e.Current.ControlType.ProgrammaticName;frameworkId=$e.Current.FrameworkId;processId=$e.Current.ProcessId;nativeWindowHandle=$e.Current.NativeWindowHandle;isEnabled=$e.Current.IsEnabled;isOffscreen=$e.Current.IsOffscreen;hasKeyboardFocus=$e.Current.HasKeyboardFocus;isPassword=$isPassword;canScrollIntoView=(ScrollItem $e);runtimeId=$rid;rect=[ordered]@{left=$r.Left;top=$r.Top;width=$r.Width;height=$r.Height};surfaceName=$surface.Current.Name;surfaceClassName=$surface.Current.ClassName;surfaceKind=$sk;surfaceIsModal=$modal;surfaceRect=[ordered]@{left=$sr.Left;top=$sr.Top;width=$sr.Width;height=$sr.Height};ancestors=(Ancestors $e $surface)}
}
if($null -eq $focus){[ordered]@{supported=$true;focus=$null;focusedWindow=$null;elements=@();surfaces=@();displays=@();truncated=$false}|ConvertTo-Json -Depth 9 -Compress;exit}
$focusPid=$focus.Current.ProcessId
$root=[System.Windows.Automation.AutomationElement]::RootElement
$tops=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$focusSurface=$focus
while($null -ne $focusSurface){$p=[System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($focusSurface);if($null -eq $p -or $p -eq $root){break};$focusSurface=$p}
$surfaces=New-Object System.Collections.Generic.List[object]
for($i=0;$i -lt $tops.Count;$i++){$w=$tops.Item($i);if($w.Current.ProcessId -eq $focusPid){$surfaces.Add($w)}}
$ordered=New-Object System.Collections.Generic.List[object]
if($null -ne $focusSurface -and $focusSurface.Current.ProcessId -eq $focusPid){$ordered.Add($focusSurface)}
foreach($w in $surfaces){$same=$false;try{$same=(($w.GetRuntimeId() -join ',') -eq ($focusSurface.GetRuntimeId() -join ','))}catch{};if(!$same){$ordered.Add($w)};if($ordered.Count -ge ${surfaceLimit}){break}}
$rows=New-Object System.Collections.Generic.List[object];$surfaceRows=New-Object System.Collections.Generic.List[object];$remaining=${limit};$truncated=$false
foreach($w in $ordered){
  if($remaining -le 0){$truncated=$true;break}
  $surfaceRows.Add((Elem $w $w));$all=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);$take=[Math]::Min($all.Count,$remaining)
  for($j=0;$j -lt $take;$j++){$rows.Add((Elem $all.Item($j) $w))};$remaining-=$take;if($all.Count -gt $take){$truncated=$true}
}
$displayRows=New-Object System.Collections.Generic.List[object]
foreach($s in [System.Windows.Forms.Screen]::AllScreens){$b=$s.Bounds;$wa=$s.WorkingArea;$displayRows.Add([ordered]@{deviceName=$s.DeviceName;primary=$s.Primary;bounds=[ordered]@{left=$b.Left;top=$b.Top;width=$b.Width;height=$b.Height};workingArea=[ordered]@{left=$wa.Left;top=$wa.Top;width=$wa.Width;height=$wa.Height}})}
[ordered]@{supported=$true;focus=(Elem $focus $focusSurface);focusedWindow=(Elem $focusSurface $focusSurface);elements=$rows;surfaces=$surfaceRows;displays=$displayRows;totalDescendants=$rows.Count;truncated=$truncated;coordinateSpace='uia-screen'}|ConvertTo-Json -Depth 9 -Compress`;
  const raw=await runPowerShell(script,{timeout:30000});const data=JSON.parse(String(raw||'{}').replace(/:\s*-?(?:Infinity|NaN)/g,':0'));const surfaces=arr(data.surfaces).map(normalizeElement),elements=arr(data.elements).map(normalizeElement),focusedWindow=data.focusedWindow?normalizeElement(data.focusedWindow):(surfaces[0]||null);
  return{supported:true,platform:'win32',capturedAt:new Date().toISOString(),focus:data.focus?normalizeElement(data.focus):null,window:focusedWindow,focusedWindow,elements,surfaces,displays:arr(data.displays).map(normalizeDisplay),totalDescendants:Number(data.totalDescendants||elements.length),truncated:Boolean(data.truncated),coordinateSpace:String(data.coordinateSpace||'uia-screen'),policy:{readOnly:true,noClick:true,noKeyboard:true,noValueWrite:true,multiSurface:true,displayContext:true}};
}
async function listTopLevelWindows({maxWindows=80}={}){
  if(process.platform!=='win32')return{supported:false,platform:process.platform,windows:[]};const limit=clampInt(maxWindows,10,200,80);
  const script=`$ErrorActionPreference='Stop';Add-Type -AssemblyName UIAutomationClient;Add-Type -AssemblyName UIAutomationTypes;$root=[System.Windows.Automation.AutomationElement]::RootElement;$all=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition);$rows=New-Object System.Collections.Generic.List[object];$take=[Math]::Min($all.Count,${limit});for($i=0;$i -lt $take;$i++){$e=$all.Item($i);$r=$e.Current.BoundingRectangle;$rid=@();try{$rid=@($e.GetRuntimeId())}catch{};$modal=$false;try{$wp=$e.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern);$modal=[bool]$wp.Current.IsModal}catch{};$kind=$(if($modal){'dialog'}elseif($e.Current.ClassName -eq '#32768'){'menu'}else{'window'});$rows.Add([ordered]@{name=$e.Current.Name;automationId=$e.Current.AutomationId;className=$e.Current.ClassName;controlType=$e.Current.ControlType.ProgrammaticName;frameworkId=$e.Current.FrameworkId;processId=$e.Current.ProcessId;nativeWindowHandle=$e.Current.NativeWindowHandle;isEnabled=$e.Current.IsEnabled;isOffscreen=$e.Current.IsOffscreen;isPassword=$false;surfaceName=$e.Current.Name;surfaceClassName=$e.Current.ClassName;surfaceKind=$kind;surfaceIsModal=$modal;surfaceRect=[ordered]@{left=$r.Left;top=$r.Top;width=$r.Width;height=$r.Height};runtimeId=$rid;rect=[ordered]@{left=$r.Left;top=$r.Top;width=$r.Width;height=$r.Height}})};[ordered]@{windows=$rows;total=$all.Count;truncated=($all.Count -gt $take)}|ConvertTo-Json -Depth 7 -Compress`;
  const raw=await runPowerShell(script,{timeout:20000});const data=JSON.parse(String(raw||'{}').replace(/:\s*-?(?:Infinity|NaN)/g,':0'));return{supported:true,platform:'win32',capturedAt:new Date().toISOString(),windows:arr(data.windows).map(normalizeElement),total:Number(data.total||0),truncated:Boolean(data.truncated),policy:{readOnly:true}};
}
module.exports={inspectWindowsUi,listTopLevelWindows,clampInt,normalizeElement,normalizeDisplay};
