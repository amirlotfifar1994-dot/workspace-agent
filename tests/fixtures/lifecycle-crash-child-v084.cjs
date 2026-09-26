const fs=require('fs');
const {LifecycleState}=require('../../electron/services/lifecycle-state.cjs');
const dir=process.argv[2],ready=process.argv[3];
if(!dir||!ready)process.exit(2);
const state=new LifecycleState(dir,{heartbeatMs:5000});
state.beginSession({version:'test-child'});
fs.writeFileSync(ready,'ready','utf8');
setInterval(()=>{},1000);
