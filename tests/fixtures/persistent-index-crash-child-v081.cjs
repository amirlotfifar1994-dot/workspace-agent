const {PersistentFileIndex}=require('../../electron/services/persistent-file-index.cjs');
const [base,root]=process.argv.slice(2);const index=new PersistentFileIndex(base);
setTimeout(()=>{if(process.send)process.send({type:'kill-now'});},120);
index.scan(root,{resume:true,dbBatchSize:1,maxWallTimeMs:600000,maxFilesSession:0,maxDirsSession:0}).then(()=>{if(process.send)process.send({type:'finished'});index.close();process.exit(0);}).catch(error=>{if(process.send)process.send({type:'error',error:error.code||error.message});process.exit(2);});
