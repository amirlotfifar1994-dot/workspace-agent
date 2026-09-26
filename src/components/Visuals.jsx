import React from'react';

const P={
 agent:'M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15z',
 files:'M4 6h6l2 2h8v10a1 1 0 01-1 1H5a1 1 0 01-1-1V6zM8 13h8M8 16h5',
 search:'M11 4a7 7 0 105 11.9l4 4 1.4-1.4-4-4A7 7 0 0011 4z',
 duplicates:'M8 8h10a1 1 0 011 1v10a1 1 0 01-1 1H8a1 1 0 01-1-1V9a1 1 0 011-1zM5 16V5a1 1 0 011-1h10',
 cleanup:'M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12M10 11v5M14 11v5',
 health:'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10zM8 12h2l1.5-3 2 5 1.5-2H16',
 drive:'M4 14l2.5-8h11L20 14M4 14v4a1 1 0 001 1h14a1 1 0 001-1v-4M4 14h16M8 17h.01M11 17h.01',
 intelligence:'M9 3a4 4 0 00-4 4 3.5 3.5 0 00-1 6 3.5 3.5 0 005 4V3zM15 3a4 4 0 014 4 3.5 3.5 0 011 6 3.5 3.5 0 01-5 4V3z',
 pdf:'M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5M9 14h6M9 17h4',
 zones:'M12 3v10m0 0l-3.5-3.5M12 13l3.5-3.5M5 17v2h14v-2',
 snapshots:'M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
 home:'M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1v-8z',
 explorer:'M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 11h18',
 mission:'M5 4v17M5 5h11l-2 4 2 4H5',
 ai:'M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2M9 9h6v6H9z',
 review:'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
 index:'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
 automation:'M13 3L5 14h6l-1 7 8-11h-6l1-7z',
 watch:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
 recovery:'M4 12a8 8 0 108-8M4 4v5h5M12 8v4l3 2',
 system:'M4 5h16v11H4zM9 20h6M12 16v4',
 uia:'M4 4h16v16H4zM4 9h16M9 9v11',
 cert:'M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3zM9 12l2 2 4-4',
 settings:'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2.2l-1-2-3 1 .5 2L5.5 8.5 3.5 8l-1 3 2 1v.1l-2 1 1 3 2-.5L7 17.5l-.5 2 3 1 1-2h2.2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z',
 cycles:'M12 7v5l3 2M3 12a9 9 0 109-9 9 9 0 00-7 3.4M3 4v4h4',
 default:'M5 5h14v14H5zM9 9h6v6H9z'
};

export function NavIcon({name}){
 return <svg className="navicon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name]||P.default}/></svg>;
}

// Illustration for the agent page: loose files on one side, organised folders on the other, joined by a sparkle.
export function AgentHero(){
 const file=(x,y,r,c)=><g transform={`translate(${x} ${y}) rotate(${r})`} key={x+'-'+y}><rect width="34" height="44" rx="5" fill={`var(--hero-${c})`} opacity=".9"/><path d="M8 14h18M8 22h18M8 30h11" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".85"/></g>;
 const folder=(x,y,c,label)=><g transform={`translate(${x} ${y})`} key={x}><path d="M0 12a5 5 0 015-5h16l6 7h30a5 5 0 015 5v33a5 5 0 01-5 5H5a5 5 0 01-5-5V12z" fill={`var(--hero-${c})`}/><path d="M0 22h66v28a5 5 0 01-5 5H5a5 5 0 01-5-5V22z" fill="#fff" opacity=".16"/><text x="33" y="46" textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">{label}</text></g>;
 return <svg className="hero-art" viewBox="0 0 520 190" role="img" aria-label="سازمان‌دهی فایل‌ها">
  <defs><linearGradient id="hg" x1="0" x2="1"><stop offset="0" stopColor="var(--hero-a)"/><stop offset="1" stopColor="var(--hero-b)"/></linearGradient></defs>
  <rect x="1" y="1" width="518" height="188" rx="22" fill="var(--hero-bg)" stroke="var(--hero-line)"/>
  {file(36,34,-14,'a')}{file(78,86,9,'b')}{file(122,30,-4,'c')}{file(60,128,-8,'c')}{file(140,100,14,'a')}
  <path d="M200 96h70" stroke="url(#hg)" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9"/>
  <g transform="translate(282 66)"><circle cx="30" cy="30" r="30" fill="url(#hg)"/><path d="M30 12l3.6 9.2L43 25l-9.4 3.8L30 38l-3.6-9.2L17 25l9.4-3.8L30 12z" fill="#fff"/></g>
  <path d="M356 96h34" stroke="url(#hg)" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9"/>
  {folder(402,26,'a','Docs')}{folder(402,96,'b','Photos')}{folder(456,62,'c','Work')}
 </svg>;
}
