const assert=require('assert');const os=require('os');const fs=require('fs');const path=require('path');
const {listSkills,validateSkillStep,registrySummary}=require('../electron/services/skill-registry.cjs');
const {compileMissionPlan,verifyDag}=require('../electron/services/mission-compiler.cjs');
const {planGoal}=require('../electron/services/goal-planner.cjs');
const {inspectWindowsUi,listTopLevelWindows,clampInt}=require('../electron/services/windows-uia.cjs');
const {CycleStore}=require('../electron/services/cycle-store.cjs');const {CycleEngine}=require('../electron/services/cycle-engine.cjs');
(async()=>{
 const skills=listSkills();assert.ok(skills.length>=15);assert.ok(skills.some(x=>x.cycleType==='windows-ui-map'));
 for(const s of skills.filter(x=>x.risk==='write'))assert.equal(s.confirmation,true,`write skill without confirmation: ${s.id}`);
 const summary=registrySummary();assert.equal(summary.total,skills.length);assert.ok(summary.write>=4);
 assert.equal(validateSkillStep({type:'arbitrary-shell'}).ok,false);
 const goal=planGoal('این پوشه را بررسی کن و فایل های تکراری را پیدا کن و مرتب کن');const dag=compileMissionPlan(goal);assert.equal(verifyDag(dag).ok,true);assert.equal(dag.nodes.length,goal.steps.length);assert.ok(dag.nodes.some(x=>x.risk==='write'&&x.requiresConfirmation));
 for(let i=1;i<dag.nodes.length;i++)assert.deepEqual(dag.nodes[i].dependsOn,[dag.nodes[i-1].id]);
 assert.equal(clampInt(99999,25,1500,500),1500);assert.equal(clampInt('x',25,1500,500),500);
 if(process.platform!=='win32'){
   const ui=await inspectWindowsUi();const wins=await listTopLevelWindows();assert.equal(ui.supported,false);assert.equal(wins.supported,false);
 }
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'wa-budget-'));const store=new CycleStore(state);const engine=new CycleEngine({store,maxIterations:10,maxWallTimeMs:10000});
 engine.register('budget-demo',{async next(){return{status:'running'}}});
 let c=engine.create('budget-demo',{}, {activeElapsedMs:5000,budget:{maxWallTimeMs:1,maxIterations:10}});c=await engine.run(c.id);assert.equal(c.status,'failed');assert.ok(c.evidence.some(x=>x.code==='MAX_WALL_TIME'));
 console.log('upstream-foundation-v071.test: OK',{skills:skills.length,dagNodes:dag.nodes.length,writeSkills:summary.write});
})().catch(e=>{console.error(e);process.exit(1)});
