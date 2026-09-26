import React from'react';

const A='var(--hero-a)',B='var(--hero-b)',C='var(--hero-c)';
const doc=(x,y,c,r=0,lines=3)=><g key={x+'-'+y+'-'+c} transform={`translate(${x} ${y}) rotate(${r})`}><rect width="34" height="44" rx="5" fill={c}/>{Array.from({length:lines}).map((_,i)=><path key={i} d={`M8 ${13+i*8}h${i===lines-1?11:18}`} stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".88"/>)}</g>;
const folder=(x,y,c,w=56)=><g key={x+'-'+y} transform={`translate(${x} ${y})`}><path d={`M0 10a4 4 0 014-4h13l5 6h${w-22}a4 4 0 014 4v${w*0.55-12}a4 4 0 01-4 4H4a4 4 0 01-4-4V10z`} fill={c}/><path d={`M0 20h${w}v${w*0.55-22}a4 4 0 01-4 4H4a4 4 0 01-4-4V20z`} fill="#fff" opacity=".18"/></g>;

const ART={
 files:()=><>{doc(10,22,A,-10)}{doc(36,50,B,8)}{doc(64,14,C,-4)}<path d="M104 56h26" stroke={B} strokeWidth="3.5" strokeLinecap="round" strokeDasharray="2 8"/>{folder(134,14,A)}{folder(134,58,B)}</>,
 search:()=><>{doc(14,14,C,-6,4)}{doc(44,32,A,5,4)}<g transform="translate(78 24)"><circle cx="30" cy="30" r="24" fill="none" stroke={B} strokeWidth="7"/><circle cx="30" cy="30" r="24" fill="#fff" opacity=".12"/><path d="M48 48l22 22" stroke={B} strokeWidth="9" strokeLinecap="round"/></g></>,
 duplicates:()=><>{doc(28,26,A,-6)}{doc(52,34,A,6)}<g transform="translate(96 40)"><circle cx="20" cy="20" r="20" fill={B}/><path d="M10 15h20M10 25h20" stroke="#fff" strokeWidth="4" strokeLinecap="round"/></g>{doc(146,30,C,0)}</>,
 cleanup:()=><><g transform="translate(70 22)"><path d="M6 14h48l-4 62a6 6 0 01-6 5H16a6 6 0 01-6-5L6 14z" fill={A}/><rect x="0" y="6" width="60" height="9" rx="4" fill={C}/><path d="M22 2h16v6H22z" fill={C}/><path d="M22 30v38M30 30v38M38 30v38" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".7"/></g>{doc(14,20,B,-12,2)}{doc(30,54,C,10,2)}<path d="M132 34l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill={B}/></>,
 health:()=><><path d="M80 92S30 62 30 34a24 24 0 0150-8 24 24 0 0150 8c0 28-50 58-50 58z" fill={A} opacity=".92"/><path d="M40 52h24l8-18 12 34 9-16h20" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="140" cy="26" r="12" fill={B}/><path d="M134 26l5 5 8-9" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></>,
 drive:()=><><g transform="translate(20 20)"><circle cx="40" cy="40" r="34" fill="none" stroke={C} strokeWidth="16" opacity=".35"/><circle cx="40" cy="40" r="34" fill="none" stroke={A} strokeWidth="16" strokeDasharray="130 214" transform="rotate(-90 40 40)"/><circle cx="40" cy="40" r="34" fill="none" stroke={B} strokeWidth="16" strokeDasharray="50 214" strokeDashoffset="-130" transform="rotate(-90 40 40)"/></g><rect x="112" y="30" width="44" height="8" rx="4" fill={A}/><rect x="112" y="50" width="30" height="8" rx="4" fill={B}/><rect x="112" y="70" width="38" height="8" rx="4" fill={C} opacity=".6"/></>,
 intelligence:()=><><g stroke={C} strokeWidth="2.5" opacity=".7"><path d="M40 55L80 25M40 55L80 85M80 25L125 55M80 85L125 55M80 25L80 85M125 55L150 30"/></g>{[[40,55,A],[80,25,B],[80,85,B],[125,55,A],[150,30,C]].map(([x,y,c],i)=><circle key={i} cx={x} cy={y} r="11" fill={c}/>)}<circle cx="125" cy="55" r="4" fill="#fff"/></>,
 pdf:()=><><g transform="translate(52 6)"><path d="M0 6a6 6 0 016-6h36l22 22v72a6 6 0 01-6 6H6a6 6 0 01-6-6V6z" fill="#fff" opacity=".95"/><path d="M42 0l22 22H48a6 6 0 01-6-6V0z" fill={C}/><rect x="10" y="60" width="44" height="6" rx="3" fill={A} opacity=".5"/><rect x="10" y="72" width="34" height="6" rx="3" fill={A} opacity=".5"/><rect x="10" y="84" width="40" height="6" rx="3" fill={A} opacity=".5"/><rect x="8" y="30" width="34" height="16" rx="4" fill={A}/><text x="25" y="42" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">PDF</text></g><path d="M134 44l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill={B}/></>,
 zones:()=><><path d="M80 14v46m0 0l-16-16m16 16l16-16" fill="none" stroke={B} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/><path d="M34 62v20a6 6 0 006 6h80a6 6 0 006-6V62" fill="none" stroke={A} strokeWidth="8" strokeLinecap="round"/>{doc(24,4,C,-12,2)}{doc(112,6,C,10,2)}</>,
 snapshots:()=><><g transform="translate(24 24)"><rect width="76" height="56" rx="10" fill={A}/><path d="M22 0l6-8h20l6 8" fill={A}/><circle cx="38" cy="30" r="17" fill="#fff" opacity=".9"/><circle cx="38" cy="30" r="10" fill={C}/></g><path d="M116 40h30M116 56h20" stroke={B} strokeWidth="5" strokeLinecap="round"/><circle cx="110" cy="40" r="4" fill={B}/><circle cx="110" cy="56" r="4" fill={B}/></>
};

const TIPS={
 files:'پیش از هر تغییر، پیش‌نمایش می‌بینید و همه چیز قابل Undo است.',
 search:'نتیجه‌ها را می‌توانید مستقیم در Explorer باز کنید.',
 duplicates:'فقط فایل‌هایی که محتوایشان دقیقاً یکی است تکراری حساب می‌شوند.',
 cleanup:'فایل‌های زائد به قرنطینه می‌روند و هر وقت خواستید برمی‌گردند.',
 health:'یک امتیاز کلی و لیست فایل‌های حجیم، قدیمی و زائد.',
 drive:'ببینید کدام پوشه‌ها بیشترین فضای دیسک را گرفته‌اند.',
 intelligence:'تحلیل محتوا برای پیشنهادهای بهتر مرتب‌سازی.',
 pdf:'متن PDFها استخراج می‌شود تا جست‌وجو و دسته‌بندی راحت‌تر شود.',
 zones:'Downloads و Desktop را زیر نظر بگیرید تا شلوغ نشوند.',
 snapshots:'قبل از یک تغییر بزرگ وضعیت را ذخیره کنید و بعد مقایسه کنید.'
};

export const hasPageHero=tab=>Boolean(ART[tab]);

export default function PageHero({tab}){
 const Art=ART[tab];if(!Art)return null;
 return <div className="page-hero"><svg viewBox="0 0 180 104" width="180" height="104" aria-hidden="true">{Art()}</svg><p>{TIPS[tab]}</p></div>;
}
