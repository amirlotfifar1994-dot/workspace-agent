const assert=require('assert');
const {rankUiaCandidates,recoverCandidate}=require('../electron/services/ui-grounding-core.cjs');
const {allowedActionsForControlType,buildActionPlan}=require('../electron/services/windows-action-policy.cjs');
const win={name:'Editor',className:'MainWindow',processId:55,rect:{left:0,top:0,width:1200,height:800}};
const dialog={surfaceName:'Save As',surfaceClassName:'#32770',surfaceKind:'dialog',surfaceIsModal:true,surfaceRect:{left:220,top:120,width:700,height:520}};
const rows=[
 {name:'Save',automationId:'saveMain',className:'Button',controlType:'ControlType.Button',frameworkId:'Win32',processId:55,isEnabled:true,isOffscreen:false,rect:{left:1000,top:730,width:90,height:34},surfaceName:'Editor',surfaceClassName:'MainWindow',surfaceKind:'window',surfaceRect:win.rect,ancestors:[{name:'Toolbar',controlType:'ControlType.ToolBar'}]},
 {name:'Save',automationId:'saveDialog',className:'Button',controlType:'ControlType.Button',frameworkId:'Win32',processId:55,isEnabled:true,isOffscreen:false,rect:{left:760,top:570,width:100,height:36},...dialog,ancestors:[{name:'Save As',controlType:'ControlType.Pane'},{name:'Dialog buttons',controlType:'ControlType.Pane'}]},
 {name:'Archive item',automationId:'archiveOffscreen',className:'ListItem',controlType:'ControlType.ListItem',frameworkId:'Win32',processId:55,isEnabled:true,isOffscreen:true,canScrollIntoView:true,rect:{left:330,top:990,width:300,height:28},surfaceName:'Editor',surfaceClassName:'MainWindow',surfaceKind:'window',surfaceRect:win.rect,ancestors:[{name:'Files list',controlType:'ControlType.List'}]}
];
const map={focusedWindow:win,elements:rows,surfaces:[win,dialog],displays:[{deviceName:'DISPLAY1',bounds:{left:0,top:0,width:1920,height:1080}}]};
const r=rankUiaCandidates('Save in the dialog',{...map},{limit:5});
assert.equal(r.candidates[0].element.automationId,'saveDialog');
assert(r.candidates[0].contextScore>r.candidates[1].contextScore);
const scroll=rankUiaCandidates('scroll Archive item into view',map,{limit:5});
const off=scroll.candidates.find(x=>x.element.automationId==='archiveOffscreen');assert(off);assert.equal(off.element.canScrollIntoView,true);
assert(allowedActionsForControlType('ListItem',{canScrollIntoView:true}).includes('scrollIntoView'));
const scrollPlan=buildActionPlan({action:'scrollIntoView',selector:off.selector},{...off.element,windowName:'Editor',windowClassName:'MainWindow'});assert(scrollPlan.ok);
const previous=r.candidates[0];
const moved={...previous,element:{...previous.element,rect:{left:740,top:550,width:100,height:36}}};
const recovered=recoverCandidate(previous,[moved]);assert(recovered.ok&&recovered.moved);
const amb=recoverCandidate(previous,[moved,{...moved,id:'uia-x'}]);assert.equal(amb.ok,false);assert.equal(amb.code,'UI_GROUNDING_STALE_AMBIGUOUS');
console.log('ui-grounding-layout-v093.test.cjs PASS',{dialogTop:r.candidates[0].element.automationId,scroll:true,recovery:true});
