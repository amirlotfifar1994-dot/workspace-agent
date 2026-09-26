const assert=require('assert');
const {rankUiaCandidates,fuseVisionMatches,inferIntentClass}=require('../electron/services/ui-grounding-core.cjs');
const {deriveCropPlan}=require('../electron/services/vision-crop-service.cjs');
const {deterministicOutcome,fuseVisual}=require('../electron/services/ui-outcome-verifier.cjs');
const {buildActionPlan}=require('../electron/services/windows-action-policy.cjs');
const map={focusedWindow:{name:'Settings',className:'Window',processId:44,rect:{left:100,top:50,width:1000,height:700}},elements:[
 {name:'Cancel',automationId:'cancelBtn',className:'Button',controlType:'ControlType.Button',frameworkId:'Win32',processId:44,isEnabled:true,isOffscreen:false,isPassword:false,rect:{left:720,top:650,width:100,height:32}},
 {name:'Save settings',automationId:'saveSettings',className:'Button',controlType:'ControlType.Button',frameworkId:'Win32',processId:44,isEnabled:true,isOffscreen:false,isPassword:false,rect:{left:830,top:650,width:130,height:32}},
 {name:'Search',automationId:'query',className:'Edit',controlType:'ControlType.Edit',frameworkId:'Win32',processId:44,isEnabled:true,isOffscreen:false,isPassword:false,rect:{left:150,top:90,width:380,height:36}},
 {name:'Secret',automationId:'pwd',className:'Edit',controlType:'ControlType.Edit',frameworkId:'Win32',processId:44,isEnabled:true,isOffscreen:false,isPassword:true,rect:{left:150,top:150,width:380,height:36}}
]};
const r=rankUiaCandidates('دکمه Save settings را انتخاب کن',map,{limit:4});
assert.equal(r.candidates[0].element.automationId,'saveSettings');
assert.equal(r.candidates.some(x=>x.element.automationId==='pwd'),false);
assert.equal(inferIntentClass('روی دکمه کلیک کن'),'activate');
const mismatch=buildActionPlan({action:'setValue',selector:{automationId:'saveSettings'},value:'x'},{name:'Save settings',automationId:'saveSettings',className:'Button',controlType:'ControlType.Button',frameworkId:'Win32',processId:44,isEnabled:true,isOffscreen:false,isPassword:false,rect:{left:830,top:650,width:130,height:32}});
assert.equal(mismatch.ok,false);assert.equal(mismatch.code,'UIA_ACTION_CONTROL_MISMATCH');assert.equal(mismatch.allowedActions.includes('setValue'),false);
const fused=fuseVisionMatches(r,{matches:[{candidateId:r.candidates[0].id,confidence:.94,evidence:'visible Save settings button'}]});
assert.equal(fused.visionUsed,true);assert(fused.candidates[0].fusedConfidence>=r.candidates[0].confidence);
const crop=deriveCropPlan({windowRect:map.focusedWindow.rect,candidateRects:[r.candidates[0].element.rect],imageWidth:1000,imageHeight:700});
assert.equal(crop.ok,true);assert(crop.cropFraction<.72);assert(crop.rect.width>0&&crop.rect.height>0);
const base=deterministicOutcome({id:'c1',type:'windows-ui-action',status:'completed',actionPlan:{action:'invoke',target:{name:'Save settings',controlType:'Button'}},result:{execution:{ok:true,verification:{ok:true,mode:'invoke-returned',detail:'InvokePattern returned without exception'}}}});
assert.equal(base.ok,true);const vis=fuseVisual(base,{result:'confirmed',confidence:.88,evidence:'dialog closed',warnings:[]});assert.equal(vis.overall,'corroborated');
console.log('ui-grounding-core-v092.test.cjs PASS',{top:r.candidates[0].element.name,confidence:r.topConfidence,crop:crop.cropFraction});
