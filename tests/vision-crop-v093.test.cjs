const assert=require('assert');
const {deriveAdaptiveCropPlan}=require('../electron/services/vision-crop-service.cjs');
const displays=[{deviceName:'LEFT',primary:false,bounds:{left:-1920,top:0,width:1920,height:1080}},{deviceName:'MAIN',primary:true,bounds:{left:0,top:0,width:2560,height:1440}}];
const windowRect={left:-1500,top:120,width:1200,height:800},target={left:-620,top:760,width:110,height:34};
let p=deriveAdaptiveCropPlan({windowRect,candidateRects:[target],displays,imageWidth:1200,imageHeight:800});assert(p.ok);assert.equal(p.mapping.source,'window');assert.equal(p.mapping.confidence,'high');
p=deriveAdaptiveCropPlan({windowRect,candidateRects:[target],displays,imageWidth:1920,imageHeight:1080});assert(p.ok);assert.equal(p.mapping.source,'display');assert.equal(p.mapping.deviceName,'LEFT');assert(p.rect.x>0&&p.rect.y>0);
const fullWindow={left:200,top:100,width:1000,height:700},fullTarget={left:900,top:700,width:80,height:30};
p=deriveAdaptiveCropPlan({windowRect:fullWindow,candidateRects:[fullTarget],displays:[{deviceName:'M',primary:true,bounds:{left:0,top:0,width:1920,height:1080}}],imageWidth:1024,imageHeight:1024});assert.equal(p.ok,false);assert.equal(p.code,'VISION_CROP_MAPPING_UNTRUSTED');
console.log('vision-crop-v093.test.cjs PASS',{windowMapping:true,monitorMapping:true,untrustedRejected:true});
