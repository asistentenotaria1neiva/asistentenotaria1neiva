const fs=require('fs'),path=require('path');const d=process.argv[2];
const K={BANCOLOMBIA:/BANCOLOMBIA/i,DAVIVIENDA:/DAVIVIENDA/i,BBVA:/BBVA/i,BOGOTA:/BANCO DE BOGOT/i,FNA:/FONDO NACIONAL DEL AHORRO/i,CAJAHONOR:/CAJA PROMOTORA DE VIVIENDA MILITAR|CAJA HONOR/i,AGRARIO:/BANCO AGRARIO/i,CAJASOCIAL:/CAJA SOCIAL/i,AVVILLAS:/AV VILLAS/i,OCCIDENTE:/BANCO DE OCCIDENTE/i,POPULAR:/BANCO POPULAR/i,MUNDOMUJER:/MUNDO MUJER/i,COLPATRIA:/COLPATRIA|SCOTIABANK/i,ITAU:/ITA[UÚ]/i,
SUBSIDIO:/SUBSIDIO FAMILIAR DE VIVIENDA|subsidio/i,COMFAMILIAR:/COMFAMILIAR/i,COLSUBSIDIO:/COLSUBSIDIO/i,MICASAYA:/MI CASA YA/i,
APODERADO:/en virtud del poder|apoderad/i,SOCIEDAD:/representante legal|S\.A\.S|NIT/i,PH:/propiedad horizontal/i,MENOR:/menor de edad|NUIP/i,UAF:/UNIDAD AGR[IÍ]COLA FAMILIAR|UAF/i,REDAM:/REDAM/i,
MINUTA_EXT:/HASTA AQU[IÍ] LA MINUTA/i,ENCARGADA:/Notaria Encargada|NOTARIA E,/i,INDAGACION:/indagaci/i,LEASING:/leasing/i,CTO:/CERTIFICADO T[EÉ]CNICO DE OCUPACI/i,ACLARACION:/ACLARACI[OÓ]N/i,
NOTARIO_FIRMA:/LUIS IGNACIO VIVAS/i};
const rows=[];
for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.txt'))){const t=fs.readFileSync(path.join(d,f),'utf8');
 const tags=Object.entries(K).filter(([k,r])=>r.test(t)).map(([k])=>k);
 const blancos=(t.match(/\(\s*_*\s*\)\s*DIAS|_{3,}|\bXX+\b|, ,|de estado civil ,|actividad económica ,|domiciliad[ao] y residente en ,/gi)||[]).length;
 const numEsc=(t.match(/ESCRITURA P[UÚ]BLICA N[UÚ]MERO:\s*([^\n]*)/i)||[])[1]||'';
 const fecha=(t.match(/FECHA DE OTORGAMIENTO:\s*([^\n]*)/i)||[])[1]||'';
 const res=[...new Set((t.match(/Resoluci[oó]n No\.? [\d-]+[^\n.]{0,30}/gi)||[]))].join(' | ');
 const elab=(t.match(/\n[^\n]*\d+\s*\/\s*MILAN[^\n]*|Elabor[oó] [A-Z]+/i)||[''])[0].trim();
 rows.push({f,tags:tags.join(','),blancos,numEsc:numEsc.trim().slice(0,60),fecha:fecha.trim().slice(0,60),res,elab});}
fs.writeFileSync('rasgos.json',JSON.stringify(rows,null,1));
for(const r of rows)console.log(`${r.f}\n   [${r.tags}] blancos=${r.blancos} | N°=${r.numEsc||'(vacío)'} | ${r.elab}\n   ${r.res}`);
