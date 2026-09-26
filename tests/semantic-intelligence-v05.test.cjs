const assert=require('assert');const os=require('os');const fs=require('fs');const fsp=fs.promises;const path=require('path');
const {dHashFromGray,findSimilarImages}=require('../electron/services/image-similarity.cjs');
const {simHash64,findSimilarTexts}=require('../electron/services/text-similarity.cjs');
const {hammingHex}=require('../electron/services/similarity-core.cjs');
const {scanTree}=require('../electron/services/file-indexer.cjs');
const {analyzeWorkspaceIntelligence}=require('../electron/services/workspace-intelligence.cjs');
const {planGoal}=require('../electron/services/goal-planner.cjs');
(async()=>{
  const g1=[];const g2=[];const g3=[];for(let y=0;y<8;y++)for(let x=0;x<9;x++){g1.push(220-x*18+y);g2.push(218-x*18+y+(x===4&&y===4?6:0));g3.push(20+x*20+y);}
  const h1=dHashFromGray(g1),h2=dHashFromGray(g2),h3=dHashFromGray(g3);assert.ok(hammingHex(h1,h2)<=2);assert.ok(hammingHex(h1,h3)>20);
  const fakeFiles=[{path:'/a.jpg',ext:'.jpg',name:'a.jpg',size:10},{path:'/b.jpg',ext:'.jpg',name:'b.jpg',size:11},{path:'/c.jpg',ext:'.jpg',name:'c.jpg',size:12}];const map={'/a.jpg':g1,'/b.jpg':g2,'/c.jpg':g3};
  const simImg=await findSimilarImages(fakeFiles,{threshold:6,loadGray:async p=>map[p]});assert.equal(simImg.groupsTotal,1);assert.equal(simImg.groups[0].files.length,2);
  const t1='Project Alpha weekly report budget schedule milestone delivery client review';const t2='Project Alpha weekly report budget schedule milestone delivery and client review updated';const t3='Recipe ingredients tomato basil olive oil pasta kitchen dinner';assert.ok(hammingHex(simHash64(t1),simHash64(t2))<hammingHex(simHash64(t1),simHash64(t3)));
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-semantic-'));await fsp.mkdir(path.join(root,'Alpha Project'));await fsp.writeFile(path.join(root,'Alpha Project','README.md'),'# Alpha Project\nMain client delivery workspace and project notes');await fsp.writeFile(path.join(root,'Alpha Project','alpha-plan.txt'),t1);await fsp.writeFile(path.join(root,'Alpha Project','alpha-budget.csv'),'item,budget\nA,10');await fsp.writeFile(path.join(root,'Alpha Project','alpha-design.pdf'),'fake pdf');await fsp.writeFile(path.join(root,'alpha project final.pdf'),'loose');await fsp.writeFile(path.join(root,'document.txt'),'Quarterly Operations Review\nThis document contains quarterly operations performance, delivery risks, milestones and actions for the team.');await fsp.writeFile(path.join(root,'copy.txt'),t2);await fsp.writeFile(path.join(root,'other.txt'),t3);
  const scan=await scanTree(root);const text=await findSimilarTexts(scan.files,{threshold:18});assert.ok(text.groupsTotal>=1);
  const intel=await analyzeWorkspaceIntelligence(root,scan.files,{minConfidence:.5});assert.ok(intel.projects.some(p=>p.relativePath==='Alpha Project'));assert.ok(intel.destinationSuggestions.some(x=>x.name==='alpha project final.pdf'&&x.suggestedFolder.endsWith('Alpha Project')));assert.ok(intel.renameSuggestions.some(x=>x.currentName==='document.txt'&&x.suggestedName.startsWith('Quarterly Operations Review')));assert.equal(intel.policy.autoApply,false);
  const goal=planGoal('عکس های مشابه را پیدا کن و پروژه ها را تشخیص بده و پیشنهاد مقصد بده');assert.ok(goal.steps.some(s=>s.type==='similar-images'));assert.ok(goal.steps.some(s=>s.type==='workspace-intelligence'));assert.equal(goal.steps.every(s=>!s.requiresConfirmation),true);
  console.log('semantic-intelligence-v05.test: OK');
})().catch(e=>{console.error(e);process.exit(1)});
