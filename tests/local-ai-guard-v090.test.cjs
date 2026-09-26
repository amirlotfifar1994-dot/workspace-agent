const assert=require('assert');
const {AICallGuard}=require('../electron/services/ai-call-guard.cjs');
let cfg={enabled:true,callsPerMinute:2,maxPromptChars:100,breakerFailures:2,breakerCooldownMs:10000};
const guard=new AICallGuard({getConfig:()=>cfg});
const a=guard.begin({promptChars:10,kind:'plan'});assert.throws(()=>guard.begin({promptChars:10}),e=>e.code==='AI_BUSY');guard.failure(a,Object.assign(new Error('x'),{code:'X'}));
const b=guard.begin({promptChars:10,kind:'plan'});guard.failure(b,Object.assign(new Error('x'),{code:'X'}));assert.equal(guard.snapshot().circuitOpen,true);assert.throws(()=>guard.begin({promptChars:10}),e=>e.code==='AI_CIRCUIT_OPEN');guard.resetCircuit();
const sizeGuard=new AICallGuard({getConfig:()=>({...cfg,callsPerMinute:10})});assert.throws(()=>sizeGuard.begin({promptChars:101}),e=>e.code==='AI_PROMPT_TOO_LARGE');
console.log('local-ai-guard-v090.test.cjs PASS',guard.snapshot());
