import React,{useEffect,useState}from'react';
export default function AgentPanel({api,root}){
 const[command,setCommand]=useState(''),[status,setStatus]=useState(null),[busy,setBusy]=useState(false),[res,setRes]=useState(null),[applied,setApplied]=useState(null),[error,setError]=useState(''),[provider,setProvider]=useState('anthropic');
 useEffect(()=>{api.agentStatus().then(setStatus).catch(()=>{})},[]);
 async function run(){setBusy(true);setError('');setRes(null);setApplied(null);try{const r=await api.agentRun(command,root,provider);if(!r?.ok)setError(r?.message||r?.code||'ناموفق');else setRes(r)}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function apply(){setBusy(true);setError('');try{const r=await api.agentApply(res.planId);setApplied(r);if(!r?.ok)setError(r?.message||'بعضی مراحل کامل نشد');else setRes(x=>({...x,planId:null}))}catch(e){setError(e.message)}finally{setBusy(false)}}
 const cur=status?.providers?.[provider];
 const groups=res?.plan?.moves.reduce((m,x)=>((m[x.toFolder||'(همان پوشه)']=m[x.toFolder||'(همان پوشه)']||[]).push(x),m),{})||{};
 const examples=['فایل‌های مرتبط با پروژه … را پیدا کن و در پوشه‌های مرتب بگذار','همه فاکتورها و رسیدها را در یک پوشه جمع کن','اسم فایل‌های PDF را بر اساس محتوایشان مرتب و خوانا کن'];
 return <div className="panel agent">
  <ol className="steps"><li className={root?'done':'now'}><b>1</b> انتخاب پوشه</li><li className={root&&!res?'now':res?'done':''}><b>2</b> نوشتن درخواست</li><li className={res&&!applied?'now':applied?'done':''}><b>3</b> مرور طرح</li><li className={applied?'done':''}><b>4</b> تأیید و اجرا</li></ol>
  {!root&&<div className="hint">برای شروع، از نوار بالا «انتخاب پوشه…» را بزنید.</div>}
  <div className="providers"><label>مدل هوش مصنوعی: <select value={provider} onChange={e=>setProvider(e.target.value)}>{Object.entries(status?.providers||{}).map(([k,v])=><option key={k} value={k}>{v.label}{v.keyPresent?'':' — بدون کلید'}</option>)}</select></label>{cur&&<small>{cur.model}</small>}</div>
  {cur&&!cur.keyPresent&&<div className="preview-box"><b>کلید API این مدل تنظیم نشده</b><small>متغیر محیطی {cur.keyName} را در Windows (User) ست کنید و برنامه را دوباره باز کنید.</small></div>}
  <small>توجه: نام فایل‌ها و بخش کوچکی از فایل‌های متنی که Agent بخواند به سرور {cur?.label||'مدل انتخابی'} فرستاده می‌شود.{provider==='deepseek'?' سرورهای DeepSeek خارج از ایران/اروپا هستند؛ برای فایل‌های حساس استفاده نکنید.':''}</small>
  <div className="chips">{examples.map(x=><button key={x} className="chip" onClick={()=>setCommand(x)}>{x}</button>)}</div>
  <textarea className="command" value={command} onChange={e=>setCommand(e.target.value)} placeholder="درخواست خود را به فارسی بنویسید…"/>
  <div className="actions"><button className="primary" onClick={run} disabled={!root||!command.trim()||busy||!cur?.keyPresent}>{busy&&!res?'در حال کار…':'اجرا'}</button></div>
  {error&&<div className="preview-box"><b>خطا</b><small>{error}</small></div>}
  {res&&<div className="preview-box"><p>{res.message}</p>
   {res.plan&&<><b>{res.plan.summary}</b>{Object.entries(groups).map(([f,items])=><div key={f}><b>{f}/</b>{items.map(m=><div className="preview-row" key={m.from}><span>{m.from}{m.newName?` ← نام جدید: ${m.newName}`:''}</span><small>{m.reason}</small></div>)}</div>)}
    {res.planId&&<div className="actions"><button className="primary" onClick={apply} disabled={busy}>تأیید و اجرا ({res.plan.moves.length} فایل)</button><button onClick={()=>setRes(null)} disabled={busy}>رد کردن</button></div>}</>}
   <small>توکن: ورودی {res.usage?.input} · خروجی {res.usage?.output} · {res.usage?.turns} نوبت</small></div>}
  {applied&&<div className="preview-box"><b>{applied.ok?'انجام شد':'ناقص'}</b>{applied.results?.map(r=><div className="preview-row" key={r.cycleId}><span>{r.action==='rename'?`Rename: ${r.from} → ${r.to}`:`Move → ${r.folder}`}</span><small>{r.count?`${r.count} فایل · `:''}{r.status}{r.blocker?` · ${r.blocker}`:''}</small></div>)}<small>هر مرحله در «تاریخچه چرخه‌ها» قابل Undo است؛ برای برگرداندن، از آخرین مرحله به اول Undo کنید.</small></div>}
 </div>;
}
