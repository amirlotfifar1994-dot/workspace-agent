const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const zlib=require('zlib');
const {DiagnosticsBundleService}=require('../electron/services/diagnostics-bundle-service.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-diag-'));const file=path.join(dir,'diagnostics.json.gz');
const svc=new DiagnosticsBundleService({appVersion:'0.9.8',journal:{verify:()=>({ok:true,count:2}),list:()=>[{at:'x',type:'TEST',payload:{password:'secret',root:'C:\\Private\\Docs'}}],append:()=>{}},selfCheckService:{run:()=>({overall:'pass',summary:{pass:9,warn:0,block:0},checks:[]})},persistentFileIndex:{health:()=>({ok:true,dbPath:'C:\\Users\\Alice\\index.sqlite',roots:{completed:1}})},recoveryService:{inspect:()=>[]},watcherService:{status:()=>({dirtyRoots:[{root:'C:\\Private\\Docs'}],blockedRoots:[]})},rootResilienceService:{status:()=>({roots:[{root:'C:\\Private\\Docs',status:'online'}]})},lifecycleState:{status:()=>({sessionId:'s'})},resourcePressureGuard:{snapshot:()=>({state:'normal'})},localAIService:{status:()=>({enabled:true,baseUrl:'http://127.0.0.1:8080/v1',runtime:{modelPath:'D:\\Models\\private.gguf'},token:'bad'})},updateGuard:{status:()=>({currentVersion:'0.9.8'})}});
const r=svc.saveTo(file);assert.strictEqual(r.ok,true);const text=zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');assert(!text.includes('C:\\\\Private'));assert(!text.includes('Alice'));assert(!text.includes('\"bad\"'));assert(text.includes('\"secretsIncluded\": false'));assert(text.includes('pathsRedacted'));console.log('diagnostics-v098.test.cjs PASS');
