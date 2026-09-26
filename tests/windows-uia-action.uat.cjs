const assert=require('assert');const fs=require('fs');const os=require('os');const path=require('path');const {spawn}=require('child_process');
const {prepareWindowsUiAction,executePinnedWindowsUiAction}=require('../electron/services/windows-uia-actions.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  if(process.platform!=='win32'){console.log('windows-uia-action.uat: SKIP (Windows only)');return;}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-uia-uat-'));const marker=path.join(dir,'invoke.marker');const ps1=path.join(dir,'harness.ps1');
  const safeMarker=marker.replace(/'/g,"''");
  fs.writeFileSync(ps1,`Add-Type -AssemblyName System.Windows.Forms\nAdd-Type -AssemblyName System.Drawing\n$form=New-Object System.Windows.Forms.Form\n$form.Text='Workspace Agent UIA UAT';$form.Name='UatWindow';$form.Width=520;$form.Height=260;$form.StartPosition='CenterScreen'\n$edit=New-Object System.Windows.Forms.TextBox;$edit.Name='titleEdit';$edit.AccessibleName='Title Input';$edit.Left=30;$edit.Top=30;$edit.Width=420;$form.Controls.Add($edit)\n$check=New-Object System.Windows.Forms.CheckBox;$check.Name='demoCheck';$check.AccessibleName='Demo Check';$check.Text='Demo Check';$check.Left=30;$check.Top=75;$form.Controls.Add($check)\n$button=New-Object System.Windows.Forms.Button;$button.Name='demoButton';$button.AccessibleName='Demo Invoke';$button.Text='Demo Invoke';$button.Left=30;$button.Top=120;$button.Width=150;$button.Add_Click({Set-Content -LiteralPath '${safeMarker}' -Value 'invoked' -Encoding UTF8});$form.Controls.Add($button)\n$form.TopMost=$true;$form.Add_Shown({$form.Activate();$edit.Focus()});[void]$form.ShowDialog()\n`,'utf8');
  const child=spawn('powershell.exe',['-NoProfile','-Sta','-ExecutionPolicy','Bypass','-File',ps1],{windowsHide:false,stdio:'ignore'});
  try{
    await sleep(1400);const pid=child.pid;assert.ok(pid>0);
    const editReq={action:'setValue',selector:{processId:pid,windowName:'Workspace Agent UIA UAT',automationId:'titleEdit',controlType:'Edit'},value:'Workspace Agent UAT'};
    const edit=await prepareWindowsUiAction(editReq);assert.equal(edit.ok,true,JSON.stringify(edit));const editOut=await executePinnedWindowsUiAction(edit.plan,'Workspace Agent UAT');assert.equal(editOut.ok,true,JSON.stringify(editOut));assert.equal(editOut.verification.mode,'value-equality');
    const checkReq={action:'toggle',selector:{processId:pid,windowName:'Workspace Agent UIA UAT',automationId:'demoCheck',controlType:'CheckBox'}};const check=await prepareWindowsUiAction(checkReq);assert.equal(check.ok,true,JSON.stringify(check));const checkOut=await executePinnedWindowsUiAction(check.plan);assert.equal(checkOut.ok,true,JSON.stringify(checkOut));assert.equal(checkOut.verification.mode,'toggle-state');
    const invokeReq={action:'invoke',selector:{processId:pid,windowName:'Workspace Agent UIA UAT',automationId:'demoButton',controlType:'Button'}};const invoke=await prepareWindowsUiAction(invokeReq);assert.equal(invoke.ok,true,JSON.stringify(invoke));const invokeOut=await executePinnedWindowsUiAction(invoke.plan);assert.equal(invokeOut.ok,true,JSON.stringify(invokeOut));await sleep(250);assert.equal(fs.existsSync(marker),true,'Invoke semantic marker not created');
    console.log('windows-uia-action.uat: PASS',{pid,setValue:editOut.verification.mode,toggle:checkOut.verification.detail,invokeMarker:true});
  }finally{try{child.kill()}catch{};try{fs.rmSync(dir,{recursive:true,force:true})}catch{}}
})().catch(e=>{console.error('windows-uia-action.uat: FAIL',e);process.exit(1)});
