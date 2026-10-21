# Ficha: Cancelación de patrimonio de familia inembargable

- **Identificador:** `cancelacion_patrimonio`
- **Categoría:** A. Actos sobre inmuebles
- **Prioridad:** Alta
- **Estado en la carpeta:** ⚠️ Existe con problemas
- **Estado de aprobación:** Pendiente de aprobación del notario

## Archivo(s) fuente

- **F02** – 10 - CIUDADELA SALAMANCA LA NUEVA VIS - [N.C.C.G.] - CANCELACION PATRIMONIO - DR. [W.]  
  Reventa de vivienda VIS; hipoteca a favor del Banco de Bogotá con minuta del banco.
- **F05** – 13 - CESACION Y LIQUIDACION CON BIENES - HIJOS MAYORES - CANCELAR PATRIMONIO - CANCELAR AFECTACION - DRA. [L.]  
  Cesación con bienes ($17.000.000), hijos mayores, apoderada; incluye dos aclaraciones de nombre.
- **F13** – 2 - FUERON CASADOS (DIVORCIADOS) - CANCELACION CONDICION 5 AÑOS - CANCELACION PATRIMONIO - HIJOS MAYORES - PODER ← **fuente sugerida para la plantilla**  
  Excónyuges divorciados; uno con poder del otro; condición de 5 años; hijos mayores.
- **F38** – 388 - LOTE SIN CONSTRUCCION - CANCELACION PATRIMONIO  
  Cancelación de patrimonio previa a la venta.
- **F47** – 400 - CASA HABITACION - CANCELACION PATRIMONIO SOLTERA (HIJOS MAYORES) - DECLARACION CONSTRUCCION (RECONOCIMIENTO) - SOLTERA  
  Cancelación de patrimonio (hijos mayores), declaración de construcción por reconocimiento y venta.
- **F61** – 6 - CONDICION 5 AÑOS - CANCELACION PATRIMONIO - SOLTERA - HIJOS MAYORES  
  Condición de 5 años (subsidio Comfamiliar) + patrimonio con hijos mayores.
- **F64** – 7 - APARTAMENTO - ENTRE RIOS ETAPA I - CANCELACION CONDICION 5 AÑOS - CANCELACION PATRIMONIO SOLTERO - DR. [W.]  
  Condición 5 años + patrimonio + compraventa + hipoteca Banco de Bogotá.
- **F68** – CANCELACION PATRIMONIO FAMILIA Y COMPRAVENTA [K.]2  
  Cancelación de patrimonio con beneficiaria MENOR de edad (concepto ICBF) + compraventa de apartamento y parqueadero.

## Actos que incluye

- No aparece como escritura independiente.
- Combinaciones observadas en la carpeta:
  - Cancelación de patrimonio de familia inembargable + Compraventa con constitución de hipoteca
  - Cancelación de patrimonio de familia inembargable + Aclaración o corrección de escritura + Cancelación de afectación a vivienda familiar + Cesación de efectos civiles de matrimonio religioso de mutuo acuerdo + Disolución y liquidación de sociedad conyugal
  - Cancelación de condición resolutoria + Cancelación de patrimonio de familia inembargable
  - Cancelación de patrimonio de familia inembargable + Compraventa de inmueble
  - Cancelación de patrimonio de familia inembargable + Declaración de construcción o mejoras + Compraventa de inmueble
  - Cancelación de condición resolutoria + Cancelación de patrimonio de familia inembargable + Compraventa con constitución de hipoteca

## Variables

### Específicas del acto

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `titulo_constitucion` | texto | Escritura que lo constituyó | Sí |
| `beneficiarios` | lista | Nombre e identificación; edad (mayores/menores) | Sí |
| `hijos_mayores_de_edad` | booleano | Si hay menores beneficiarios: exige trámite especial (Defensor/ICBF o juez) – alerta CRÍTICA | Sí |
| `estado_civil_constituyente` | enum | Determina si comparece cónyuge/compañero | Sí |

### Bloques comunes

**Encabezado / carátula**

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `numero_escritura` | entero | Asignado al protocolizar; se escribe en letras y en números automáticamente | No |
| `fecha_otorgamiento` | fecha | Se escribe en letras automáticamente ("CUATRO (04) DE AGOSTO DE DOS MIL VEINTISÉIS (2026)") | No |
| `notario_autoriza` | enum | TITULAR \| ENCARGADO; si es encargado, exige resolución SNR del encargo | Sí |
| `resolucion_encargo` | texto | Obligatoria cuando autoriza notario(a) encargado(a); formato "AAAA-NNNNNN-N del DD de MES de AAAA" | No |
| `especificacion_actos` | lista | Cada acto con su cuantía en pesos o "SIN CUANTÍA"; debe coincidir con los actos del cuerpo | Sí |
| `otorgamiento_diferentes_momentos` | booleano | Art. 9 Decreto 2148 de 1983 (referencia citada en las minutas) | No |

**Cada compareciente (persona natural)**

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `nombre_completo` | texto | MAYÚSCULAS; igual en carátula, cuerpo y firmas; coincidir con documento de identidad | Sí |
| `genero` | enum | M \| F – controla la concordancia (domiciliado/domiciliada, identificado/identificada) | Sí |
| `tipo_documento` | enum | CC \| CE \| NUIP \| TI \| PASAPORTE | Sí |
| `numero_documento` | texto | CC: 3 a 10 dígitos, con puntos de miles; igual en carátula, cuerpo y firmas | Sí |
| `lugar_expedicion` | texto | Municipio de expedición del documento | Sí |
| `domicilio` | texto | Municipio y abreviatura del departamento, p. ej. "Neiva (H)" | Sí |
| `estado_civil` | enum | SOLTERO(A) SIN UNIÓN MARITAL \| SOLTERO(A) CON UNIÓN MARITAL \| CASADO(A) CON SOCIEDAD CONYUGAL VIGENTE \| CASADO(A) CON SOCIEDAD CONYUGAL DISUELTA Y LIQUIDADA \| DIVORCIADO(A) \| VIUDO(A) | Sí |
| `actividad_economica` | texto | Obligatoria (SARLAFT / formato de firmas) | Sí |
| `datos_firma` | lista | Dirección, teléfono, e‑mail, PEP sí/no (Decreto 830 de 2021), nacionalidad – formato al pie | No |

**Representación (apoderados)**

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `apoderado` | persona | Persona natural completa; si es abogado, tarjeta profesional | Sí |
| `apoderado_tarjeta_profesional` | texto | Solo si el apoderado actúa como abogado (divorcios, UMH, partición) | No |
| `tipo_poder` | enum | ESPECIAL \| GENERAL | Sí |
| `poder_soporte` | texto | Escritura (número, fecha, notaría) o documento privado con presentación personal; certificado de vigencia si es poder por escritura | Sí |
| `facultades_poder` | texto | La IA debe verificar que las facultades cubran el acto, el inmueble y la cuantía | Sí |

**Persona jurídica (bancos, fiduciarias, sociedades)**

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `razon_social` | texto | Igual al certificado de existencia y representación | Sí |
| `nit` | texto | NNN.NNN.NNN-D con dígito de verificación válido (algoritmo DIAN) | Sí |
| `domicilio_principal` | texto |  | Sí |
| `representante` | persona | Representante legal o apoderado; verificar facultades y límites de cuantía | Sí |
| `certificado_existencia_fecha` | fecha | Vigencia máxima a definir por el notario (pendiente) | Sí |

**Cada inmueble**

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `tipo_inmueble` | enum | LOTE \| CASA \| APARTAMENTO \| LOCAL \| BODEGA \| PARQUEADERO \| DEPÓSITO \| PREDIO RURAL \| MEJORAS | Sí |
| `nombre_o_direccion` | texto | Nomenclatura completa; igual en carátula y cuerpo | Sí |
| `municipio_departamento` | texto |  | Sí |
| `area_terreno` | area | Número con dos decimales + letras automáticas ("NOVENTA Y SIETE PUNTO CINCUENTA METROS CUADRADOS (97.50 M2)") | No |
| `area_construida` | area | Ídem | No |
| `descripcion` | texto | Descripción física / dependencias | No |
| `linderos` | texto | Por puntos cardinales; cruzar contra el certificado de tradición o el título anterior | Sí |
| `matricula_inmobiliaria` | texto | Formato CCC-NNNNNN (círculo registral - número); igual en carátula, cuerpo y certificado | Sí |
| `oficina_registro` | texto | ORIP del círculo (Neiva 200, La Plata 204, Pitalito 206, etc.) | Sí |
| `cedula_catastral` | texto | 15, 20, 25 o 30 dígitos; indicar si está "involucrada" en mayor extensión | Sí |
| `cedula_catastral_paz_salvo` | texto | Debe corresponder al mismo predio | No |
| `propiedad_horizontal` | booleano | Si aplica: escritura del reglamento (número, fecha, notaría), coeficiente y áreas privadas/comunes | No |
| `matricula_matriz` | texto | Solo si la catastral está en mayor extensión | No |

**Tradición**

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `modo_adquisicion` | enum | COMPRA \| ADJUDICACIÓN EN SUCESIÓN \| ADJUDICACIÓN EN LIQUIDACIÓN \| DONACIÓN \| OTRO | Sí |
| `tradente_anterior` | texto | Quién le transfirió al actual titular | Sí |
| `titulo_adquisicion` | texto | Escritura número, fecha y notaría; debe coincidir con la anotación del certificado de tradición | Sí |
| `estado_civil_al_adquirir` | enum | Mismo catálogo de estado civil | No |

**Soportes fiscales y certificado de tradición**

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `fecha_certificado_tradicion` | fecha | Se transcribe en la cláusula "solicita e insiste…"; advertir antigüedad (umbral pendiente del notario) | Sí |
| `paz_salvo_predial` | texto | Número de catastral, entidad, vigencia (fecha) y avalúo | Sí |
| `avaluo_catastral` | moneda | Base para comparar con el precio | No |
| `paz_salvo_valorizacion` | texto |  | No |

**Cierre**

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `hojas_papel_notarial` | lista | Códigos Aa######### – se diligencian al imprimir | No |
| `derechos_notariales` | moneda | Derechos, IVA, Fondo, Superintendencia – se liquidan en caja | No |
| `resolucion_tarifas` | texto | Resolución de tarifas vigente del año (en 2026: "Resolución No. 2026-000964-6 del 20 de Enero de 2026") | Sí |
| `codigo_minuta` | texto | Pie interno, p. ej. "COMPRAVENTA 410/ MILAN" | No |

## Documentos soporte requeridos

- Certificado de tradición
- Registros civiles de nacimiento de los beneficiarios
- Concepto del Defensor de Familia / ICBF si hay beneficiarios menores
- Documentos de identidad

## Comparecientes

Constituyente(s) y cónyuge/compañero cuando aplica

## Problemas detectados en las fuentes

- **F02:** Combina 2 actos: Cancelación de patrimonio de familia inembargable + Compraventa con constitución de hipoteca. · Minuta de hipoteca del Banco de Bogotá casi idéntica a F63 y F64 (82 % y 79 % de similitud).
- **F05:** Combina 5 actos: Cancelación de patrimonio de familia inembargable + Aclaración o corrección de escritura + Cancelación de afectación a vivienda familiar + Cesación de efectos civiles de matrimonio religioso de mutuo acuerdo + Disolución y liquidación de sociedad conyugal.
- **F13:** Combina 2 actos: Cancelación de condición resolutoria + Cancelación de patrimonio de familia inembargable.
- **F38:** Combina 2 actos: Cancelación de patrimonio de familia inembargable + Compraventa de inmueble.
- **F47:** Combina 3 actos: Cancelación de patrimonio de familia inembargable + Declaración de construcción o mejoras + Compraventa de inmueble. · Error en la fecha: "SESIS (06)".
- **F61:** Combina 2 actos: Cancelación de condición resolutoria + Cancelación de patrimonio de familia inembargable. · Borrador: número y fecha de escritura sin asignar
- **F64:** Combina 3 actos: Cancelación de condición resolutoria + Cancelación de patrimonio de familia inembargable + Compraventa con constitución de hipoteca. · Mismo modelo bancario que F02 y F63.
- **F68:** Combina 2 actos: Cancelación de patrimonio de familia inembargable + Compraventa de inmueble. · Formato distinto al estándar de la notaría (elaborado por otra persona). · Cifra mal escrita: "$150.000. 000.oo". · Cancelación con beneficiaria menor: la sustitución del patrimonio queda para otra escritura – requiere validación jurídica del notario. · Títulos de actos: aparece "PRIMER ACTO" y "TERCER ACTO" (revisar numeración). · Cifra con espacio dentro del número · Borrador: número y fecha de escritura sin asignar
- **Todas:** son escrituras reales con datos personales; se trabajó sobre copias anonimizadas en `datos_locales/copias_trabajo/`.

## Referencia normativa – pendiente de validar por el notario

> Normas **citadas en los textos de la notaría** para este tipo. Se registran como referencia; **no se afirma su vigencia** ni su aplicabilidad. El notario debe validarlas.

- Ley 258 de 1996 _(citada en 8 de 8 archivo(s) fuente)_
- Ley 70 de 1931 _(citada en 7 de 8 archivo(s) fuente)_
- Ley 854 de 2003 _(citada en 4 de 8 archivo(s) fuente)_
- Código Civil _(citada en 3 de 8 archivo(s) fuente)_
- Ley 2010 de 2019 _(citada en 3 de 8 archivo(s) fuente)_
- Decreto 145 de 2000 _(citada en 2 de 8 archivo(s) fuente)_
- Decreto 663 de 1993 _(citada en 2 de 8 archivo(s) fuente)_
- Ley 1395 de 2010 _(citada en 2 de 8 archivo(s) fuente)_
- Ley 1579 de 2012 _(citada en 2 de 8 archivo(s) fuente)_
- Ley 1676 de 2013 _(citada en 2 de 8 archivo(s) fuente)_
- Ley 495 de 1999 _(citada en 2 de 8 archivo(s) fuente)_
- Ley 546 de 1999 _(citada en 2 de 8 archivo(s) fuente)_
- Ley 788 de 2002 _(citada en 2 de 8 archivo(s) fuente)_
- Decreto 2106 de 2019 _(citada en 2 de 8 archivo(s) fuente)_
- Ley 675 de 2001 _(citada en 2 de 8 archivo(s) fuente)_
- Ley 14 de 1983 _(citada en 1 de 8 archivo(s) fuente)_
- Decreto 4436 de 2005 _(citada en 1 de 8 archivo(s) fuente)_
- Ley 962 de 2005 _(citada en 1 de 8 archivo(s) fuente)_
- Decreto 1711 de 1984 _(citada en 1 de 8 archivo(s) fuente)_
- Decreto Ley 19 de 2012 _(citada en 1 de 8 archivo(s) fuente)_

_Nota: este tipo solo aparece combinado; la lista puede incluir normas de los otros actos de esas escrituras._

Citadas en el cierre común de las escrituras:

- Ley 1581 de 2012 y Decreto 1377 de 2013 (datos personales)
- Decreto 960 de 1970, art. 35 (corrección de errores por nueva escritura)
- Ley 223 de 1995, art. 232 y Decreto 650 de 1996, art. 14 (plazo de registro de dos meses)
- Decreto 2148 de 1983, art. 9 (otorgamiento en diferentes momentos)
- Decreto 830 de 2021 (personas expuestas políticamente – formato de firmas)
