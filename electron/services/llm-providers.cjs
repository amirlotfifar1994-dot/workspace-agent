// Provider adapters for the file agent. Each provider exposes the same tiny session interface:
//   session({system,tools,userText}) -> { step(), addResults(results) }
//   step()       -> { text, toolCalls:[{id,name,input}], stop:'tool_use'|'end'|'refusal'|'length', usage:{input,output} }
//   addResults() -> results:[{id,content,isError}]
// Base URLs are fixed on purpose: a file agent that reads local documents must not be pointable at arbitrary hosts.
const REQUEST_TIMEOUT_MS=120000;

function fail(code,message){return Object.assign(new Error(message),{code});}

function anthropicProvider({client=null,env=process.env}={}){
  const model=env.WA_CLAUDE_MODEL||'claude-opus-5';
  const getClient=()=>{
    if(client)return client;
    if(!env.ANTHROPIC_API_KEY)throw fail('AGENT_API_KEY_MISSING','ANTHROPIC_API_KEY is not set. Set it as a Windows user environment variable and restart the app.');
    const Anthropic=require('@anthropic-ai/sdk');client=new(Anthropic.default||Anthropic)();return client;
  };
  return {
    id:'anthropic',label:'Claude (Anthropic)',model,keyPresent:()=>Boolean(client||env.ANTHROPIC_API_KEY),keyName:'ANTHROPIC_API_KEY',
    session({system,tools,userText}){
      const messages=[{role:'user',content:userText}];
      return {
        async step(){
          const res=await getClient().messages.create({model,max_tokens:16000,thinking:{type:'adaptive'},system,tools,messages});
          messages.push({role:'assistant',content:res.content});
          const text=res.content.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
          const toolCalls=res.content.filter(b=>b.type==='tool_use').map(b=>({id:b.id,name:b.name,input:b.input||{}}));
          const stop=res.stop_reason==='refusal'?'refusal':res.stop_reason==='max_tokens'?'length':res.stop_reason==='tool_use'?'tool_use':'end';
          return {text,toolCalls,stop,usage:{input:res.usage?.input_tokens||0,output:res.usage?.output_tokens||0}};
        },
        addResults(results){messages.push({role:'user',content:results.map(r=>({type:'tool_result',tool_use_id:r.id,content:r.content,...(r.isError?{is_error:true}:{})}))});}
      };
    }
  };
}

// OpenAI and DeepSeek both speak the OpenAI "chat/completions" tool-calling dialect.
function openAICompatibleProvider({id,label,baseUrl,keyName,defaultModel,modelEnv,tokenParam,tokenLimit,fetchImpl=null,env=process.env}){
  const model=env[modelEnv]||defaultModel;
  const doFetch=()=>fetchImpl||globalThis.fetch;
  return {
    id,label,model,keyPresent:()=>Boolean(env[keyName]),keyName,
    session({system,tools,userText}){
      const key=env[keyName];if(!key)throw fail('AGENT_API_KEY_MISSING',`${keyName} is not set. Set it as a Windows user environment variable and restart the app.`);
      const fnTools=tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.input_schema}}));
      const messages=[{role:'system',content:system},{role:'user',content:userText}];
      return {
        async step(){
          const body={model,messages,tools:fnTools,[tokenParam]:tokenLimit};
          let res;
          try{res=await doFetch()(`${baseUrl}/chat/completions`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify(body),signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)});}
          catch(e){throw fail('AGENT_NETWORK',`${label}: request failed (${e.name==='TimeoutError'?'timeout':e.message})`);}
          const raw=await res.text();let data;try{data=JSON.parse(raw);}catch{data=null;}
          if(!res.ok){const msg=data?.error?.message||raw.slice(0,200);throw fail(res.status===401?'AGENT_API_KEY_INVALID':'AGENT_PROVIDER_ERROR',`${label} error ${res.status}: ${String(msg).split(key).join('[key]')}`);}
          const choice=data?.choices?.[0];if(!choice)throw fail('AGENT_PROVIDER_ERROR',`${label}: empty response`);
          const m=choice.message||{};messages.push({role:'assistant',content:m.content??null,...(m.tool_calls?.length?{tool_calls:m.tool_calls}:{})});
          const toolCalls=(m.tool_calls||[]).map(c=>{let input={},bad=false;try{input=JSON.parse(c.function?.arguments||'{}');}catch{bad=true;}return {id:c.id,name:c.function?.name,input,invalidJson:bad};});
          const stop=choice.finish_reason==='content_filter'?'refusal':choice.finish_reason==='length'?'length':toolCalls.length?'tool_use':'end';
          return {text:String(m.content||'').trim(),toolCalls,stop,usage:{input:data.usage?.prompt_tokens||0,output:data.usage?.completion_tokens||0}};
        },
        addResults(results){for(const r of results)messages.push({role:'tool',tool_call_id:r.id,content:r.content});}
      };
    }
  };
}

function createProviders({client=null,fetchImpl=null,env=process.env}={}){
  return {
    anthropic:anthropicProvider({client,env}),
    openai:openAICompatibleProvider({id:'openai',label:'GPT (OpenAI)',baseUrl:'https://api.openai.com/v1',keyName:'OPENAI_API_KEY',defaultModel:'gpt-4.1',modelEnv:'WA_OPENAI_MODEL',tokenParam:'max_completion_tokens',tokenLimit:16000,fetchImpl,env}),
    deepseek:openAICompatibleProvider({id:'deepseek',label:'DeepSeek',baseUrl:'https://api.deepseek.com',keyName:'DEEPSEEK_API_KEY',defaultModel:'deepseek-chat',modelEnv:'WA_DEEPSEEK_MODEL',tokenParam:'max_tokens',tokenLimit:8000,fetchImpl,env})
  };
}

module.exports={createProviders,anthropicProvider,openAICompatibleProvider};
