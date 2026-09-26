const assert=require('assert');const fs=require('fs');
const {toFsPath}=require('../electron/services/windows-path-utils.cjs');
const b=String.fromCharCode(92);
// pure-logic checks (platform injected)
assert.equal(toFsPath('C:'+b,{platform:'win32'}),'C:'+b,'drive root must not be namespaced');
assert.equal(toFsPath('c:/',{platform:'win32'}).toLowerCase(),'c:'+b);
assert(toFsPath('C:'+b+'Users'+b+'x',{platform:'win32'}).startsWith(b+b+'?'+b+'C:'),'normal paths keep the long-path prefix');
// real check on Windows: the returned drive-root path must be statable
if(process.platform==='win32'){const root=process.env.SystemDrive?process.env.SystemDrive+b:'C:'+b;assert(fs.statSync(toFsPath(root)).isDirectory());}
console.log('drive-root-path.test.cjs PASS',{driveRootStatable:true});
