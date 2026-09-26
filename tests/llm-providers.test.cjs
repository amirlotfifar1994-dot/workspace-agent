const assert=require('assert');const fs=require('fs');const os=require('os');const path=require('path');
const {ClaudeFileAgent}=require('../electron/services/claude-file-agent.cjs');
const {createProviders}=require('../electron/services/llm-providers.cjs');

function reply(obj,status=200){return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(obj)};}
function toolCall(id,name,args,raw=null){return {id,type:'function',function:{name,arguments:raw??JSON.stringify(args)}};}

(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wa-prov-'));
  try{
    fs.writeFileSync(path.join(root,'alpha-invoice.pdf'),'x');fs.writeFileSync(path.join(root,'alpha-notes.txt'),'notes');
    const env={OPENAI_API_KEY:'sk-test-openai',DEEPSEEK_API_KEY:'sk-test-deepseek'};

    // status reports which providers have keys
    const st=new ClaudeFileAgent({env:{OPENAI_API_KEY:'k'},client:null}).status();
    assert.equal(st.openai.keyPresent,true);assert.equal(st.deepseek.keyPresent,false);assert.equal(st.anthropic.keyPresent,false);
    assert.equal(createProviders({env:{}}).deepseek.model,'deepseek-chat');

    for(const [prov,url,tokenParam] of [['openai','https://api.openai.com/v1/chat/completions','max_completion_tokens'],['deepseek','https://api.deepseek.com/chat/completions','max_tokens']]){
      const calls=[];
      const script=[
        {choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[toolCall('c1','find_files',{query:'alpha'})]}}],usage:{prompt_tokens:10,completion_tokens:4}},
        {choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[toolCall('c2','propose_moves',{summary:'Group Alpha',moves:[{from:'alpha-invoice.pdf',to_folder:'Alpha/Docs',new_name:'Alpha Invoice.pdf'},{from:'alpha-notes.txt',to_folder:'Alpha/Notes'}]})]}}],usage:{prompt_tokens:20,completion_tokens:9}}
      ];
      const fetchImpl=async(u,opts)=>{calls.push({u,opts,body:JSON.parse(opts.body)});return reply(script.shift());};
      const agent=new ClaudeFileAgent({env,fetchImpl});const events=[];
      const out=await agent.run({command:'alpha را منظم کن',root,provider:prov,onEvent:e=>events.push(e.name)});
      assert.deepEqual(events,['find_files','propose_moves']);assert.equal(out.plan.moves.length,2);assert.equal(out.plan.moves[0].newName,'Alpha Invoice.pdf');assert.equal(out.provider,prov);assert.equal(out.usage.turns,2);assert.equal(out.usage.input,30);
      assert.equal(calls[0].u,url,'base URL must be fixed');
      assert.equal(calls[0].opts.headers.authorization,'Bearer '+env[prov==='openai'?'OPENAI_API_KEY':'DEEPSEEK_API_KEY']);
      assert.equal(calls[0].body.tools[0].type,'function');assert(calls[0].body.tools.some(t=>t.function.name==='propose_moves'&&t.function.parameters.type==='object'));
      assert.equal(calls[0].body[tokenParam]>0,true);
      // second request must carry the assistant tool_calls and the tool result
      const m2=calls[1].body.messages;assert.equal(m2[m2.length-2].role,'assistant');assert(m2[m2.length-2].tool_calls);assert.equal(m2[m2.length-1].role,'tool');assert.equal(m2[m2.length-1].tool_call_id,'c1');
      assert.equal(fs.existsSync(path.join(root,'alpha-invoice.pdf')),true,'agent must never move files itself');
    }

    // invalid JSON arguments are reported back to the model, which can retry
    {const script=[
      {choices:[{finish_reason:'tool_calls',message:{tool_calls:[toolCall('b1','find_files',null,'{not json')]}}],usage:{}},
      {choices:[{finish_reason:'stop',message:{content:'nothing relevant'}}],usage:{}}];
     const seen=[];const fetchImpl=async(u,o)=>{seen.push(JSON.parse(o.body));return reply(script.shift());};
     const out=await new ClaudeFileAgent({env,fetchImpl}).run({command:'find zzz',root,provider:'deepseek'});
     assert.equal(out.plan,null);assert.equal(out.message,'nothing relevant');assert(/valid JSON/.test(seen[1].messages.at(-1).content));}

    // errors: bad key is reported without leaking the key; missing key blocks the request
    await assert.rejects(()=>new ClaudeFileAgent({env,fetchImpl:async()=>reply({error:{message:'Incorrect API key sk-test-openai'}},401)}).run({command:'find x',root,provider:'openai'}),e=>e.code==='AGENT_API_KEY_INVALID'&&!e.message.includes('sk-test-openai'));
    await assert.rejects(()=>new ClaudeFileAgent({env:{},fetchImpl:async()=>{throw new Error('should not be called');}}).run({command:'find x',root,provider:'deepseek'}),e=>e.code==='AGENT_API_KEY_MISSING');
    await assert.rejects(()=>new ClaudeFileAgent({env,fetchImpl:async()=>{throw new Error('socket hang up');}}).run({command:'find x',root,provider:'openai'}),e=>e.code==='AGENT_NETWORK');
    await assert.rejects(()=>new ClaudeFileAgent({env}).run({command:'find x',root,provider:'nope'}),e=>e.code==='AGENT_PROVIDER_UNKNOWN');
    await assert.rejects(()=>new ClaudeFileAgent({env,fetchImpl:async()=>reply({choices:[{finish_reason:'content_filter',message:{content:''}}]})}).run({command:'find x',root,provider:'openai'}),e=>e.code==='AGENT_REFUSED');
    console.log('llm-providers.test.cjs PASS',{openai:true,deepseek:true,keyRedaction:true,fixedBaseUrl:true});
  }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
