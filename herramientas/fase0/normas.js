const fs=require('fs'),path=require('path');const d=process.argv[2];const out={};
const norm=s=>s.replace(/\s+/g,' ').replace(/Decreto Ley/i,'Decreto Ley').replace(/^./,c=>c.toUpperCase());
const COMUNES=new Set(['Ley 1581 de 2012','Decreto 1377 de 2013','Decreto 960 de 1970','Ley 223 de 1995','Decreto 650 de 1996','Decreto 2148 de 1983','Ley 2010 de 2019','Ley 2097 de 2021','Decreto 1310 de 2022','Decreto 830 de 2021','Decreto Ley 960 de 1970']);
for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.txt'))){const t=fs.readFileSync(path.join(d,f),'utf8');const s=new Set();
 for(const m of t.matchAll(/\b(Ley|Decreto(?: Ley| Reglamentario)?|Decreto-Ley)\s+(\d{1,5}[a-z]?\.?)\s+(?:del?\s+(?:\d{1,2} de \w+ de\s+)?|de\s+)(\d{4})/gi)){let k=norm(`${m[1].replace(/Reglamentario/i,'').trim()} ${m[2].replace('.','')} de ${m[3]}`);k=k.replace(/^Decreto-ley/i,'Decreto Ley');if(!COMUNES.has(k))s.add(k)}
 if(/C[oó]digo General del Proceso/i.test(t))s.add('Código General del Proceso (Ley 1564 de 2012)');
 if(/C[oó]digo Civil/i.test(t))s.add('Código Civil');
 if(/Resoluci[oó]n No\.? 088 de 2014/i.test(t))s.add('Resolución SNR 088 de 2014');
 out[f]=[...s].sort();}
fs.writeFileSync('normas.json',JSON.stringify(out,null,1));
const all={};for(const v of Object.values(out))for(const n of v)all[n]=(all[n]||0)+1;console.log(Object.entries(all).sort((a,b)=>b[1]-a[1]).map(x=>x.join(': ')).join('\n'));
