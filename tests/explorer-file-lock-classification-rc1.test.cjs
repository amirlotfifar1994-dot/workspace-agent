const assert=require('assert');
const {classifyIoError}=require('../electron/services/explorer-storage-guard.cjs');
const busy=classifyIoError(Object.assign(new Error('busy'),{code:'EBUSY'}));assert.equal(busy.recoverable,true);assert.equal(busy.category,'locked');assert.equal(busy.code,'EXPLORER_FILE_LOCKED');
const txt=classifyIoError(Object.assign(new Error('text busy'),{code:'ETXTBSY'}));assert.equal(txt.category,'locked');
const eperm=classifyIoError(Object.assign(new Error('operation not permitted'),{code:'EPERM'}));assert.equal(eperm.recoverable,true);assert.equal(eperm.category,'permission-or-lock');assert.equal(eperm.code,'EXPLORER_FILE_LOCK_OR_PERMISSION');
const access=classifyIoError(Object.assign(new Error('access denied'),{code:'EACCES'}));assert.equal(access.category,'permission');
console.log('explorer-file-lock-classification-rc1.test.cjs PASS',{busy:true,epermAmbiguous:true,permission:true});
