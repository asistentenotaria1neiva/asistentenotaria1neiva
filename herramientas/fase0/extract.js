const fs=require('fs'),path=require('path'),JSZip=require('jszip');
const [src,out]=process.argv.slice(2);
(async()=>{const rows=[];
for(const f of fs.readdirSync(src).filter(x=>/\.docx$/i.test(x))){
 const p=path.join(src,f),st=fs.statSync(p);let text='',estado='OK';
 try{const z=await JSZip.loadAsync(fs.readFileSync(p));const x=await z.file('word/document.xml').async('string');
  text=x.replace(/<w:tab\/>/g,'\t').replace(/<\/w:p>/g,'\n').replace(/<w:br[^>]*\/>/g,'\n').replace(/<[^>]+>/g,'')
   .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
  if(!text.trim())estado='VACÍO';}catch(e){estado='ERROR: '+e.message}
 fs.writeFileSync(path.join(out,f.replace(/\.docx$/i,'.txt')),text);
 rows.push({archivo:f,tamano:st.size,modificado:st.mtime.toISOString(),estado,caracteres:text.length,palabras:text.split(/\s+/).filter(Boolean).length});}
fs.writeFileSync(path.join(out,'_inventario.json'),JSON.stringify(rows,null,1));
console.log(rows.map(r=>`${r.estado}\t${r.palabras}\t${r.modificado.slice(0,10)}\t${r.archivo}`).join('\n'));})();
