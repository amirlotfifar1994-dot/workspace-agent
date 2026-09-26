const {listSkills}=require('./skill-registry.cjs');
function norm(v=''){return String(v||'').toLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\u200f\u202a-\u202e]/g,' ').replace(/[^\p{L}\p{N}._-]+/gu,' ').replace(/\s+/g,' ').trim();}
function tokens(v=''){return new Set(norm(v).split(' ').filter(x=>x.length>1));}
function overlap(a,b){let n=0;for(const x of a)if(b.has(x))n++;return n;}
const HINTS=[
  [/تکراری|duplicate|کپی/,['duplicate','duplicates']], [/جست|search|پیدا/,['search']], [/مرتب|organize|دسته/,['organize']], [/rename|تغییر نام|نام فایل/,['rename']],
  [/سلامت|health|فضا|حجم/,['health','audit']], [/pdf/,['pdf']], [/عکس|image|photo/,['image']], [/متن|document|سند/,['text','intelligence']], [/ویندوز|windows/,['windows']], [/index|ایندکس/,['index']], [/اکسپلورر|explorer|پوشه|folder/,['explorer']], [/properties|مشخصات/,['properties']], [/copy|کپی|move|انتقال/,['explorer']]
];
function retrieveSkills(command,{limit=10,memory=null}={}){const q=tokens(command);const hintWords=HINTS.filter(([rx])=>rx.test(norm(command))).flatMap(([,w])=>w);const rows=listSkills().filter(s=>!s.interactiveOnly&&['active','beta'].includes(s.status)).map(s=>{const hay=tokens(`${s.id} ${s.title} ${s.group} ${s.cycleType}`);let score=overlap(q,hay)*5;for(const h of hintWords)if(norm(`${s.id} ${s.title} ${s.cycleType}`).includes(h))score+=4;if(s.risk==='read')score+=0.6;if(s.risk==='write')score-=0.2;const m=memory?.stats?.(s.id);if(m)score+=(m.reliability-0.5)*1.5;return{...s,score:Number(score.toFixed(3)),reliability:m?.reliability??0.5};}).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));const picked=rows.filter(x=>x.score>0).slice(0,limit);const defaults=rows.filter(x=>['skill.workspace.health','skill.index.search','skill.workspace.intelligence'].includes(x.id));for(const d of defaults)if(picked.length<Math.min(limit,5)&&!picked.some(x=>x.id===d.id))picked.push(d);return picked.slice(0,limit);}
module.exports={retrieveSkills,norm,tokens};
