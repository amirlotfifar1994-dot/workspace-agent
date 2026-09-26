const {validateSkillStep,skillByCycleType}=require('./skill-registry.cjs');
const DAG_SCHEMA_VERSION='workspace-mission-dag-v1';
function clone(v){return JSON.parse(JSON.stringify(v));}
function compileMissionPlan(goalPlan={}, {maxNodes=24,maxWallTimeMs=30*60*1000}={}){
  const source=Array.isArray(goalPlan.steps)?goalPlan.steps:[];
  if(source.length>maxNodes)throw Object.assign(new Error(`Mission بیش از سقف ${maxNodes} گام دارد.`),{code:'MISSION_MAX_NODES'});
  const nodes=[];
  for(let i=0;i<source.length;i++){
    const s=source[i]||{};const validation=validateSkillStep(s);
    if(!validation.ok)throw Object.assign(new Error(validation.message),{code:validation.code,details:{step:s}});
    const skill=validation.skill;const deps=i===0?[]:[nodes[i-1].id];
    nodes.push({
      id:String(s.id||`mission-node-${i+1}`),skillId:skill.id,cycleType:skill.cycleType,label:String(s.label||skill.title),input:clone(s.input||{}),reason:String(s.reason||''),
      risk:skill.risk,requiresConfirmation:Boolean(skill.confirmation),dependsOn:deps,status:'pending'
    });
  }
  return{
    schemaVersion:DAG_SCHEMA_VERSION,
    nodes,
    limits:{maxNodes,maxWallTimeMs},
    policy:{arbitraryShell:false,unregisteredSkills:false,writeRequiresConfirmation:true},
    summary:{nodes:nodes.length,read:nodes.filter(x=>x.risk==='read').length,local:nodes.filter(x=>x.risk==='agent-local').length,write:nodes.filter(x=>x.risk==='write').length}
  };
}
function nextRunnableNode(dag={},completedIds=[]){
  const done=new Set(completedIds);return (dag.nodes||[]).find(n=>n.status!=='completed'&&(n.dependsOn||[]).every(d=>done.has(d)))||null;
}
function verifyDag(dag={}){
  const ids=new Set();for(const node of dag.nodes||[]){if(!node.id||ids.has(node.id))return{ok:false,code:'MISSION_DAG_DUPLICATE_NODE'};ids.add(node.id);if(!skillByCycleType(node.cycleType))return{ok:false,code:'MISSION_DAG_UNKNOWN_SKILL'};}
  for(const node of dag.nodes||[])for(const dep of node.dependsOn||[])if(!ids.has(dep))return{ok:false,code:'MISSION_DAG_MISSING_DEPENDENCY',nodeId:node.id,dependency:dep};
  return{ok:true};
}
module.exports={DAG_SCHEMA_VERSION,compileMissionPlan,nextRunnableNode,verifyDag};
