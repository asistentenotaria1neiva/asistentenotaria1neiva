# Plantillas por aprobar – escrituras de ejemplo 2026

> Estado: **PENDIENTE DE APROBACIÓN DEL NOTARIO**.

Plantillas sacadas de las escrituras de la carpeta «Ejemplos» (noviembre de 2026). En cada una, los datos del caso
se cambiaron por `{{variables}}` y el resto es el **texto literal de la notaría**. Cuando había otro ejemplo del
mismo tipo (en esta carpeta o en `plantillas/modelos/`), se tomó también como referencia para las variantes.

| Plantilla (tipo del catálogo) | Escritura(s) de origen | Variantes que cubre |
| --- | --- | --- |
| `cancelacion_afectacion` – Cancelación de afectación a vivienda familiar | Ejemplo «Cancelación AFV – unión libre» · modelo F14 | uno o ambos propietarios; cónyuges o compañeros permanentes |
| `divorcio_civil` – Divorcio de matrimonio civil de mutuo acuerdo | Ejemplo «Divorcio con hija menor» · Ejemplo «Divorcio sin hijos» · modelo F59 | con o sin hijos menores (acuerdo, concepto del Defensor/Comisario, mérito ejecutivo); hijos mayores; sociedad en ceros o con bienes; matrimonio por escritura o ante juez; no embarazo; 3 oficios de registro |
| `declaracion_construccion` – Declaración de construcción | Ejemplo «Declaración de construcción por apoderada» · modelo F47 | por apoderado o directa; construcción autorizada o reconocida; resolución aclaratoria; verificación fuera del SISG; municipio sin valorización |
| `cancelacion_patrimonio` – Cancelación de patrimonio de familia | Primer acto de Ejemplo «Cancelación de patrimonio, compraventa e hipoteca Banco de Bogotá» · modelo F61 | sin nupcias ni hijos, o con hijos mayores de edad |
| `compraventa_hipoteca` – Compraventa con hipoteca (minuta **BANCO DE BOGOTA S.A.**) | Ejemplo «Cancelación de patrimonio, compraventa e hipoteca Banco de Bogotá» | cancelación de patrimonio como primer acto; hipoteca vigente del vendedor con el banco; afectación a vivienda familiar |

**No se hizo plantilla de «COMPRAVENTA LOTE RURAL»**: es una compraventa, que ya tiene plantilla propia con formulario
(`plantillas/fuentes/compraventa.plantilla`), y el ejemplo coincide con ella. De ese ejemplo se ajustó que un predio
rural sin construcción se describe como «Lote de terreno» y que la afectación «no procede por tratarse de un lote de
terreno sin construcción».

## Cómo se usan

1. En la aplicación, **Plantillas** → el tipo correspondiente → cargar el Word de `docx/<tipo>.docx` y enviarlo a aprobación.
2. Al aprobarla, el tipo queda disponible como acto y su formulario se arma solo con las variables, en el orden de la escritura.
   - Cada condición (`{{#hay_hijos_menores}} … {{/hay_hijos_menores}}`) es una pregunta de Sí/No.
   - Las variables que solo aparecen dentro de un bloque se piden únicamente cuando ese bloque aplica.
   - `…_es_mujer` (Sí/No) concuerda el género: domiciliado/domiciliada, el señor/la señora, apoderado/apoderada.
3. El número, la fecha, las hojas, los derechos y el código de minuta los pone el sistema o quedan para la terminación.

## Notas para la revisión del notario

- Las cláusulas se numeran solas (`{{ord()}}`) en el divorcio y la cancelación de patrimonio, según las que apliquen.
- `compraventa_hipoteca`: la compraventa y la hipoteca son la minuta del BANCO DE BOGOTA S.A. transcrita literal.
  Cada banco tiene su minuta; la del BANCO AGRARIO sigue en `plantillas/modelos/fuentes/compraventa_hipoteca.plantilla`.
  El tipo admite una sola plantilla aprobada a la vez: si se necesitan varios bancos, conviene crear un tipo por banco.
- `compraventa_hipoteca`: la afectación a vivienda familiar se indica con «¿Inmueble queda afectado a vivienda familiar?»;
  el texto de la variante afectada lo redactó el asistente con base en la Ley 258 de 1996 y la Ley 854 de 2003 (el ejemplo era de no afectación).
- Se agregó en todas el párrafo «En la ciudad de Neiva … a los … días …», como en los demás modelos (algunos ejemplos eran borradores sin él).
- Verificación: cada plantilla se generó con los datos de su ejemplo y se comparó con la escritura original
  (compraventa con hipoteca 100 %, cancelación de afectación 96,9 %; las diferencias son los datos de la terminación y las firmas).
  La prueba `pruebas/plantillas-por-aprobar.test.ts` las genera en todas sus condiciones y verifica que no quede ningún dato de los ejemplos.

Fuentes editables: `fuentes/<tipo>.plantilla` (mismo marcado que `plantillas/fuentes`). Para regenerar un Word:
`node -e "require('./herramientas/plantillas/construir').construirDocx(require('fs').readFileSync('plantillas/por_aprobar/fuentes/<tipo>.plantilla','utf8'),'<tipo>').then(b=>require('fs').writeFileSync('plantillas/por_aprobar/docx/<tipo>.docx',b))"`
