import React,{useEffect,useState}from'react';
export default function AgentPanel({api,root}){
 const[command,setCommand]=useState(''),[status,setStatus]=useState(null),[busy,setBusy]=useState(false),[res,setRes]=useState(null),[applied,setApplied]=useState(null),[error,setError]=useState('');
 useEffect(()=>{api.agentStatus().then(setStatus).catch(()=>{})},[]);
 async function run(){setBusy(true);setError('');setRes(null);setApplied(null);try{const r=await api.agentRun(command,root);if(!r?.ok)setError(r?.message||r?.code||'ناموفق');else setRes(r)}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function apply(){setBusy(true);setError('');try{const r=await api.agentApply(res.planId);setApplied(r);if(!r?.ok)setError(r?.message||'بعضی مراحل کامل نشد');else setRes(x=>({...x,planId:null}))}catch(e){setError(e.message)}finally{setBusy(false)}}
 const groups=res?.plan?.moves.reduce((m,x)=>((m[x.toFolder||'(همان پوشه)']=m[x.toFolder||'(همان پوشه)']||[]).push(x),m),{})||{};
 return <div className="panel"><h3>Claude Agent — پیدا کردن و منظم کردن فایل‌ها</h3>
  <p>یک جمله بنویسید؛ Agent داخل پوشه Workspace می‌گردد، فایل‌های مرتبط را پیدا می‌کند و یک طرح پیشنهاد می‌دهد. هیچ فایلی بدون تأیید شما جابه‌جا نمی‌شود.</p>
  {status&&!status.keyPresent&&<div className="preview-box"><b>کلید API تنظیم نشده</b><small>متغیر محیطی ANTHROPIC_API_KEY را در Windows (User) ست کنید و برنامه را دوباره باز کنید.</small></div>}
  <small>توجه: نام فایل‌ها و بخش کوچکی از فایل‌های متنی که Agent بخواند به API شرکت Anthropic فرستاده می‌شود. مدل: {status?.model||'—'}</small>
  <textarea className="command" value={command} onChange={e=>setCommand(e.target.value)} placeholder="مثلاً: فایل‌های مرتبط با پروژه Alpha را پیدا کن و در پوشه‌های مرتب بگذار"/>
  <div className="actions"><button className="primary" onClick={run} disabled={!root||!command.trim()||busy||(status&&!status.keyPresent)}>{busy&&!res?'در حال کار…':'اجرا'}</button></div>
  {error&&<div className="preview-box"><b>خطا</b><small>{error}</small></div>}
  {res&&<div className="preview-box"><p>{res.message}</p>
   {res.plan&&<><b>{res.plan.summary}</b>{Object.entries(groups).map(([f,items])=><div key={f}><b>{f}/</b>{items.map(m=><div className="preview-row" key={m.from}><span>{m.from}{m.newName?` ← نام جدید: ${m.newName}`:''}</span><small>{m.reason}</small></div>)}</div>)}
    {res.planId&&<div className="actions"><button className="primary" onClick={apply} disabled={busy}>تأیید و اجرا ({res.plan.moves.length} فایل)</button><button onClick={()=>setRes(null)} disabled={busy}>رد کردن</button></div>}</>}
   <small>توکن: ورودی {res.usage?.input} · خروجی {res.usage?.output} · {res.usage?.turns} نوبت</small></div>}
  {applied&&<div className="preview-box"><b>{applied.ok?'انجام شد':'ناقص'}</b>{applied.results?.map(r=><div className="preview-row" key={r.cycleId}><span>{r.action==='rename'?`Rename: ${r.from} → ${r.to}`:`Move → ${r.folder}`}</span><small>{r.count?`${r.count} فایل · `:''}{r.status}{r.blocker?` · ${r.blocker}`:''}</small></div>)}<small>هر مرحله در «تاریخچه چرخه‌ها» قابل Undo است؛ برای برگرداندن، از آخرین مرحله به اول Undo کنید.</small></div>}
 </div>;
}
