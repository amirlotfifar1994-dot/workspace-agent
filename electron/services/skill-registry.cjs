const SKILL_SCHEMA_VERSION='workspace-skill-registry-v1';
const RISK_ORDER=Object.freeze({read:0,'agent-local':1,write:2});

const SKILLS=Object.freeze([
  {id:'skill.workspace.health',cycleType:'workspace-health',title:'Workspace Health',risk:'read',confirmation:false,group:'storage',status:'active'},
  {id:'skill.index.build',cycleType:'persistent-index-scan',title:'Persistent File Index',risk:'agent-local',confirmation:false,group:'storage',status:'beta'},
  {id:'skill.index.maintenance',cycleType:'persistent-index-maintenance',title:'Persistent Index Maintenance',risk:'agent-local',confirmation:false,group:'storage',status:'beta'},
  {id:'skill.index.search',cycleType:'indexed-file-search',title:'Indexed File Search',risk:'read',confirmation:false,group:'storage',status:'beta'},
  {id:'skill.index.duplicates',cycleType:'indexed-duplicates',title:'Indexed Exact Duplicates',risk:'read',confirmation:false,group:'storage',status:'beta'},
  {id:'skill.file.search',cycleType:'file-search',title:'File Search',risk:'read',confirmation:false,group:'storage',status:'active'},
  {id:'skill.file.duplicates',cycleType:'duplicates',title:'Exact Duplicate Discovery',risk:'read',confirmation:false,group:'storage',status:'active'},
  {id:'skill.file.duplicate-review',cycleType:'duplicate-review',title:'Duplicate Quarantine Review',risk:'write',confirmation:true,group:'storage',status:'active'},
  {id:'skill.file.cleanup',cycleType:'maintenance-cleanup',title:'Safe Cleanup',risk:'write',confirmation:true,group:'maintenance',status:'active'},
  {id:'skill.file.organize',cycleType:'organize',title:'Safe Organize',risk:'write',confirmation:true,group:'storage',status:'active'},
  {id:'skill.file.rename',cycleType:'rename',title:'Bulk Rename',risk:'write',confirmation:true,group:'storage',status:'active'},
  {id:'skill.workspace.snapshot',cycleType:'snapshot',title:'Workspace Snapshot',risk:'agent-local',confirmation:false,group:'intelligence',status:'active'},
  {id:'skill.workspace.snapshot-diff',cycleType:'snapshot-diff',title:'Workspace Delta',risk:'read',confirmation:false,group:'intelligence',status:'active'},
  {id:'skill.image.similar',cycleType:'similar-images',title:'Similar Images',risk:'read',confirmation:false,group:'intelligence',status:'active'},
  {id:'skill.text.similar',cycleType:'similar-texts',title:'Similar Documents',risk:'read',confirmation:false,group:'intelligence',status:'active'},
  {id:'skill.workspace.intelligence',cycleType:'workspace-intelligence',title:'Workspace Intelligence',risk:'read',confirmation:false,group:'intelligence',status:'active'},
  {id:'skill.review.build',cycleType:'review-queue-build',title:'Build Review Queue',risk:'agent-local',confirmation:false,group:'agent',status:'active'},
  {id:'skill.review.apply',cycleType:'recommendation-apply',title:'Controlled Recommendation Apply',risk:'write',confirmation:true,group:'agent',status:'active'},
  {id:'skill.zone.audit',cycleType:'managed-zone-audit',title:'Managed Zone Audit',risk:'read',confirmation:false,group:'storage',status:'active'},
  {id:'skill.drive.audit',cycleType:'drive-audit',title:'Drive Audit',risk:'read',confirmation:false,group:'storage',status:'active'},
  {id:'skill.pdf.inspect',cycleType:'pdf-intelligence',title:'PDF Base Intelligence',risk:'read',confirmation:false,group:'intelligence',status:'active'},
  {id:'skill.explorer.properties',cycleType:'explorer-properties',title:'File Explorer Properties',risk:'read',confirmation:false,group:'explorer',status:'active'},
  {id:'skill.explorer.search',cycleType:'explorer-search',title:'File Explorer Search',risk:'read',confirmation:false,group:'explorer',status:'active'},
  {id:'skill.explorer.navigate',cycleType:'explorer-navigate',title:'Open Folder in File Explorer',risk:'agent-local',confirmation:false,group:'explorer',status:'beta',interactiveOnly:true},
  {id:'skill.explorer.select',cycleType:'explorer-select',title:'Reveal Item in File Explorer',risk:'agent-local',confirmation:false,group:'explorer',status:'beta',interactiveOnly:true},
  {id:'skill.explorer.new-folder',cycleType:'explorer-new-folder',title:'File Explorer New Folder',risk:'write',confirmation:true,group:'explorer',status:'beta',interactiveOnly:true},
  {id:'skill.explorer.copy',cycleType:'explorer-copy',title:'File Explorer Copy File',risk:'write',confirmation:true,group:'explorer',status:'beta',interactiveOnly:true},
  {id:'skill.explorer.move',cycleType:'explorer-move',title:'File Explorer Move',risk:'write',confirmation:true,group:'explorer',status:'beta',interactiveOnly:true},
  {id:'skill.explorer.rename',cycleType:'explorer-rename',title:'File Explorer Rename',risk:'write',confirmation:true,group:'explorer',status:'beta',interactiveOnly:true},
  {id:'skill.explorer.batch-copy',cycleType:'explorer-batch-copy',title:'File Explorer Batch / Recursive Copy',risk:'write',confirmation:true,group:'explorer',status:'beta',interactiveOnly:true},
  {id:'skill.explorer.batch-move',cycleType:'explorer-batch-move',title:'File Explorer Batch Move',risk:'write',confirmation:true,group:'explorer',status:'beta',interactiveOnly:true},
  {id:'skill.windows.system',cycleType:'windows-system',title:'Windows System Doctor',risk:'read',confirmation:false,group:'windows',status:'active'},
  {id:'skill.windows.uia-map',cycleType:'windows-ui-map',title:'Windows UIA Grounding Map',risk:'read',confirmation:false,group:'windows',status:'beta'},
  {id:'skill.windows.uia-action',cycleType:'windows-ui-action',title:'Pinned Windows UIA Action',risk:'write',confirmation:true,group:'windows',status:'beta',interactiveOnly:true},
]);

const BY_ID=new Map(SKILLS.map(x=>[x.id,x]));
const BY_CYCLE=new Map(SKILLS.map(x=>[x.cycleType,x]));
function clone(v){return JSON.parse(JSON.stringify(v));}
function skillById(id){return BY_ID.get(String(id||''))||null;}
function skillByCycleType(type){return BY_CYCLE.get(String(type||''))||null;}
function listSkills({includeInactive=false}={}){return clone(SKILLS.filter(x=>includeInactive||['active','beta'].includes(x.status)));}
function riskAtLeast(a,b){return (RISK_ORDER[a]??99)>=(RISK_ORDER[b]??99);}
function validateSkillStep(step={}){
  const skill=step.skillId?skillById(step.skillId):skillByCycleType(step.type);
  if(!skill)return{ok:false,code:'SKILL_NOT_REGISTERED',message:`Skill برای cycle type «${step.type||''}» ثبت نشده است.`};
  if(step.type&&skill.cycleType!==step.type)return{ok:false,code:'SKILL_CYCLE_MISMATCH',message:'Skill و cycle type با هم سازگار نیستند.'};
  if(skill.risk==='write'&&!skill.confirmation)return{ok:false,code:'WRITE_SKILL_CONFIRMATION_REQUIRED',message:'Skill اثرگذار باید Confirmation Gate داشته باشد.'};
  if(skill.interactiveOnly&&!step.allowInteractive)return{ok:false,code:'SKILL_INTERACTIVE_ONLY',message:'این Skill فقط از مسیر تعاملی امن UI قابل اجراست و Mission/LLM اجازه فراخوانی مستقیم آن را ندارد.'};
  return{ok:true,skill:clone(skill)};
}
function registrySummary(){
  const rows=listSkills();return{schemaVersion:SKILL_SCHEMA_VERSION,total:rows.length,read:rows.filter(x=>x.risk==='read').length,local:rows.filter(x=>x.risk==='agent-local').length,write:rows.filter(x=>x.risk==='write').length,rows};
}
module.exports={SKILL_SCHEMA_VERSION,SKILLS,listSkills,skillById,skillByCycleType,validateSkillStep,registrySummary,riskAtLeast};
