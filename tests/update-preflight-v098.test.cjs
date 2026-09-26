const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const cp=require('child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-update-preflight-'));
const out=cp.execFileSync(process.execPath,['scripts/prepare-update-v098.cjs',`--user-data=${dir}`,'--current=0.9.8','--target=1.0.0-rc1',`--sha256=${'c'.repeat(64)}`,'--backup=pre-update.json.gz'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
const j=JSON.parse(out);assert.strictEqual(j.ok,true);assert.strictEqual(j.targetVersion,'1.0.0-rc1');const state=JSON.parse(fs.readFileSync(path.join(dir,'runtime','update-guard.json'),'utf8'));assert.strictEqual(state.pending.backupFile,'pre-update.json.gz');console.log('update-preflight-v098.test.cjs PASS');
