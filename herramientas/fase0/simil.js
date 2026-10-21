const fs=require('fs'),path=require('path');const d=process.argv[2];
const fsx=fs.readdirSync(d).filter(x=>x.endsWith('.txt'));
const sh=f=>{const w=fs.readFileSync(path.join(d,f),'utf8').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z ]/g,' ').split(/\s+/).filter(Boolean);const s=new Set();for(let i=0;i<w.length-4;i++)s.add(w.slice(i,i+5).join(' '));return s;};
const S=fsx.map(sh);const out=[];
for(let i=0;i<fsx.length;i++)for(let j=i+1;j<fsx.length;j++){let a=S[i],b=S[j],n=0;for(const x of a)if(b.has(x))n++;const jac=n/(a.size+b.size-n);if(jac>0.55)out.push([jac.toFixed(2),fsx[i],fsx[j]]);}
out.sort((x,y)=>y[0]-x[0]);fs.writeFileSync('simil.json',JSON.stringify(out));out.forEach(o=>console.log(o.join('  |  ')));
