const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {atomicWriteJsonSync}=require('./durable-state.cjs');
function now(){return new Date().toISOString();}
function atomic(file,value){return atomicWriteJsonSync(file,value);}
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
class LifecycleState{
 constructor(baseDir,{journal=null,heartbeatMs=15000,setTimer=setInterval,clearTimer=clearInterval,pid=process.pid}={}){
  this.dir=path.join(baseDir,'runtime');this.file=path.join(this.dir,'lifecycle.json');this.journal=journal;this.heartbeatMs=Math.max(5000,Number(heartbeatMs)||15000);this.setTimer=setTimer;this.clearTimer=clearTimer;this.pid=pid;this.timer=null;this.current=null;fs.mkdirSync(this.dir,{recursive:true});
 }
 beginSession({version='',platform=process.platform,node=process.versions.node}={}){
  const previous=readJson(this.file);const previousUnclean=Boolean(previous?.sessionId&&previous.cleanExit!==true);const at=now();
  this.current={schemaVersion:'workspace-agent-lifecycle-v1',sessionId:`session-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`,pid:this.pid,version:String(version||''),platform:String(platform||''),node:String(node||''),startedAt:at,lastHeartbeatAt:at,cleanExit:false,cleanExitAt:null,exitReason:null,previousSession:previous?{sessionId:previous.sessionId||null,startedAt:previous.startedAt||null,lastHeartbeatAt:previous.lastHeartbeatAt||null,cleanExit:Boolean(previous.cleanExit),cleanExitAt:previous.cleanExitAt||null,exitReason:previous.exitReason||null,pid:previous.pid||null,version:previous.version||null}:null};
  atomic(this.file,this.current);this.journal?.append('APP_SESSION_STARTED',{payload:{sessionId:this.current.sessionId,previousUnclean,previousSessionId:previous?.sessionId||null,version:this.current.version}});this.startHeartbeat();return{session:{...this.current},previous,previousUnclean};
 }
 startHeartbeat(){if(this.timer||!this.current)return;this.timer=this.setTimer(()=>{try{this.heartbeat()}catch{}},this.heartbeatMs);this.timer?.unref?.();}
 heartbeat(){if(!this.current||this.current.cleanExit)return this.status();this.current.lastHeartbeatAt=now();atomic(this.file,this.current);return this.status();}
 markCleanExit(reason='will-quit'){if(this.timer){this.clearTimer(this.timer);this.timer=null;}if(!this.current){this.current=readJson(this.file)||{schemaVersion:'workspace-agent-lifecycle-v1',sessionId:null};}this.current.cleanExit=true;this.current.cleanExitAt=now();this.current.exitReason=String(reason||'will-quit');this.current.lastHeartbeatAt=this.current.cleanExitAt;atomic(this.file,this.current);this.journal?.append('APP_SESSION_CLEAN_EXIT',{payload:{sessionId:this.current.sessionId,reason:this.current.exitReason}});return this.status();}
 status(){const row=this.current||readJson(this.file);return row?{...row}:{schemaVersion:'workspace-agent-lifecycle-v1',sessionId:null,cleanExit:null};}
 stopHeartbeat(){if(this.timer){this.clearTimer(this.timer);this.timer=null;}}
}
module.exports={LifecycleState,readJson};
