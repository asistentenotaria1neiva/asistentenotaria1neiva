# Ficha: Compraventa de inmueble

- **Identificador:** `compraventa`
- **Categoría:** A. Actos sobre inmuebles
- **Prioridad:** Alta
- **Estado en la carpeta:** ⚠️ Existe con problemas
- **Estado de aprobación:** Pendiente de aprobación del notario

## Archivo(s) fuente

- **F17** – 237 - RESERVAS DE ALCALA - PARQUEADERO (2)  
  Dos parqueaderos en PH; vende sociedad (S.A.S.).
- **F18** – 255 - LOCAL - LOS COMUNEROS  
  Local comercial en PH.
- **F21** – 285 - BODEGAS BLOQUE B - SURABASTOS  
  Bodega en PH; menciona hipoteca a favor de CORPAVI de la cual se responsabiliza una parte.
- **F22** – 288 - LOTE SIN CONSTRUCCION - ADQUIEREN EN COMUNIDAD  
  Lote; compradores en común y proindiviso.
- **F24** – 292 - CASA HABITACION - CANCELACION AFECTACION - COMPRA MENOR  
  Compradora menor de edad representada por su madre.
- **F26** – 3 - CASA HABITACION - CASADA NO AFECTA - PODER  
  Con poder; compradora casada que NO afecta (constancia de indagación).
- **F30** – 306 - LOCAL - CENTRO COMERCIAL LAS AMERICAS - CANCELACION HIPOTECA BANCOLOMBIA - DRA. [A.M.]  
  Cancelación de hipoteca Bancolombia + compraventa de local en PH.
- **F31** – 317 - LOTE SIN CONSTRUCCION - PORTAL DEL MONTE - VENDE SOCIEDAD  
  Lote en condominio campestre (PH); vende sociedad por representante.
- **F35** – 354 - CASA - MULTIFAMILIAR PEREZ - CASADOS SI AFECTAN - [C.H.P.]  
  Casa en PH; compradores casados que SÍ afectan.
- **F37** – 385 - CASA HABITACION - UNION LIBRE NO AFECTA  
  Compradores en unión libre que NO afectan (constancia de indagación).
- **F38** – 388 - LOTE SIN CONSTRUCCION - CANCELACION PATRIMONIO  
  Cancelación de patrimonio previa a la venta.
- **F39** – 390 - LOTE SIN CONSTRUCCION - VENDE Y COMPRA SOCIEDAD - CONSTRUCCIONES SAN JOSE S.A.S - MANZANA 6 - PODER  
  Sociedad vende a sociedad; condominio en PH; servidumbres; minuta presentada por las partes.
- **F42** – 399 - LOTE SIN CONSTRUCCION - PODER  
  Vendedor y comprador comparecen por apoderados.
- **F47** – 400 - CASA HABITACION - CANCELACION PATRIMONIO SOLTERA (HIJOS MAYORES) - DECLARACION CONSTRUCCION (RECONOCIMIENTO) - SOLTERA  
  Cancelación de patrimonio (hijos mayores), declaración de construcción por reconocimiento y venta.
- **F48** – 405 - CASA HABITACION - UNION LIBRE NO AFECTAN  
  Tres aclaraciones de nombre + compraventa con 10 vendedores (10 % cada uno).
- **F49** – 406 - LOTE SIN CONSTRUCCION - [R.] (RIVERA) - LOTE 24 (duplicado de F55)  
  Lote en Rivera.
- **F52** – 410 - CASA HABITACION - SOLTERA ← **fuente sugerida para la plantilla**  
  Compraventa simple entre personas solteras; modelo base más limpio.
- **F53** – 413 - LOTE SIN CONSTRUCCION - UAF  
  Predio rural con constancia de Unidad Agrícola Familiar (UAF).
- **F55** – 417 - LOTE SIN CONSTRUCCION - [R.] (RIVERA) - LOTE 40 (duplicado de F49)  
  Lote en Rivera.
- **F56** – 418 - CASA HABITACION - CANCELACION 2 AÑOS - CANCELACION AFECTACION - SOLTERO  
  Condición de 2 años + cancelación de afectación + venta.
- **F57** – 419 - LOTE SIN CONSTRUCCION - (2) INMUEBLES - SABANA REAL ETAPA I  
  Dos lotes en la misma escritura (dos matrículas).
- **F58** – 420 - CASA HABITACION - SOLTERA (duplicado de F52)  
  Compraventa simple.
- **F68** – CANCELACION PATRIMONIO FAMILIA Y COMPRAVENTA [K.]2  
  Cancelación de patrimonio con beneficiaria MENOR de edad (concepto ICBF) + compraventa de apartamento y parqueadero.

## Actos que incluye

- Como escritura independiente: F17, F18, F21, F22, F26, F31, F37, F39, F42, F49, F52, F53, F55, F57, F58.
- Combinaciones observadas en la carpeta:
  - Cancelación de afectación a vivienda familiar + Compraventa de inmueble
  - Cancelación de hipoteca + Compraventa de inmueble
  - Compraventa de inmueble + Constitución de afectación a vivienda familiar
  - Cancelación de patrimonio de familia inembargable + Compraventa de inmueble
  - Cancelación de patrimonio de familia inembargable + Declaración de construcción o mejoras + Compraventa de inmueble
  - Aclaración o corrección de escritura + Compraventa de inmueble
  - Cancelación de condición resolutoria + Cancelación de afectación a vivienda familiar + Compraventa de inmueble

## Variables

### Específicas del acto

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `vendedores` | lista | Persona(s) natural(es) o jurídica(s); % de participación para exógena (suma 100 %) | Sí |
| `compradores` | lista | Ídem; si es menor de edad, representación por quien ejerce patria potestad | Sí |
| `precio` | moneda | Número → letras automáticas; comparar con avalúo catastral | Sí |
| `forma_pago` | texto | Contado / crédito / subsidio / cesantías / ahorro; debe sumar el precio | Sí |
| `afectacion_vivienda_familiar` | enum | NO APLICA (soltero) \| SÍ AFECTA \| NO AFECTA (con constancia de indagación) – Ley 258 de 1996 | Sí |
| `gravamenes_subsistentes` | texto | Si el certificado muestra hipoteca/embargo/patrimonio/condición vigente, debe cancelarse antes o declararse | No |
| `constancia_redam` | booleano | Constancia REDAM (Ley 2097 de 2021) para enajenantes | Sí |
| `venta_cuerpo_cierto` | booleano | Parágrafo de cuerpo cierto | No |

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

- Certificado de tradición y libertad (reciente)
- Paz y salvo predial y de valorización
- Copia del título de adquisición
- Documentos de identidad de los comparecientes
- Certificado de existencia y representación (si interviene persona jurídica)
- Poder (si hay apoderado)
- Registro civil de nacimiento (si compra/vende un menor)

## Comparecientes

Vendedor(es), comprador(es), cónyuges/compañeros cuando aplica afectación, apoderados o representantes

## Problemas detectados en las fuentes

- **F21:** Encabezado cita al notario titular pero la firma es de la notaria encargada (verificar). · Hipoteca anterior mencionada: verificar que la plantilla no la traslade a otros casos.
- **F24:** Combina 2 actos: Cancelación de afectación a vivienda familiar + Compraventa de inmueble. · En la carátula aparece "P. M. Q." con una cédula y "L. P. M. Q." con otra: verificar si son la misma persona (posible error de identificación).
- **F30:** Combina 2 actos: Cancelación de hipoteca + Compraventa de inmueble. · Menciona otra hipoteca (Banco Popular) asumida por el vendedor: revisar.
- **F35:** Combina 2 actos: Compraventa de inmueble + Constitución de afectación a vivienda familiar.
- **F37:** Error en la fecha: "VEITNISEIS".
- **F38:** Combina 2 actos: Cancelación de patrimonio de familia inembargable + Compraventa de inmueble.
- **F39:** Borrador: número y fecha de escritura sin asignar
- **F42:** Borrador: número y fecha de escritura sin asignar
- **F47:** Combina 3 actos: Cancelación de patrimonio de familia inembargable + Declaración de construcción o mejoras + Compraventa de inmueble. · Error en la fecha: "SESIS (06)".
- **F48:** Combina 2 actos: Aclaración o corrección de escritura + Compraventa de inmueble.
- **F49:** Duplicado casi exacto de F55 (83 %): mismo vendedor, distinto lote. · Borrador: número y fecha de escritura sin asignar
- **F52:** Versión del mismo modelo que F58 (70 %). · Borrador: número y fecha de escritura sin asignar
- **F53:** Borrador: número y fecha de escritura sin asignar
- **F55:** Duplicado casi exacto de F49 (83 %). · Borrador: número y fecha de escritura sin asignar
- **F56:** Combina 3 actos: Cancelación de condición resolutoria + Cancelación de afectación a vivienda familiar + Compraventa de inmueble. · Borrador: número y fecha de escritura sin asignar
- **F57:** Borrador: número y fecha de escritura sin asignar
- **F58:** Duplicado/versión de F52 (70 %). · Borrador: número y fecha de escritura sin asignar
- **F68:** Combina 2 actos: Cancelación de patrimonio de familia inembargable + Compraventa de inmueble. · Formato distinto al estándar de la notaría (elaborado por otra persona). · Cifra mal escrita: "$150.000. 000.oo". · Cancelación con beneficiaria menor: la sustitución del patrimonio queda para otra escritura – requiere validación jurídica del notario. · Títulos de actos: aparece "PRIMER ACTO" y "TERCER ACTO" (revisar numeración). · Cifra con espacio dentro del número · Borrador: número y fecha de escritura sin asignar
- **Todas:** son escrituras reales con datos personales; se trabajó sobre copias anonimizadas en `datos_locales/copias_trabajo/`.

## Referencia normativa – pendiente de validar por el notario

> Normas **citadas en los textos de la notaría** para este tipo. Se registran como referencia; **no se afirma su vigencia** ni su aplicabilidad. El notario debe validarlas.

- Ley 258 de 1996 _(citada en 15 de 15 archivo(s) fuente)_
- Ley 854 de 2003 _(citada en 15 de 15 archivo(s) fuente)_
- Ley 14 de 1983 _(citada en 7 de 15 archivo(s) fuente)_
- Decreto 2106 de 2019 _(citada en 5 de 15 archivo(s) fuente)_
- Ley 675 de 2001 _(citada en 5 de 15 archivo(s) fuente)_
- Decreto 4829 de 2011 _(citada en 1 de 15 archivo(s) fuente)_
- Ley 2010 de 2019 _(citada en 1 de 15 archivo(s) fuente)_
- Ley 160 de 1994 _(citada en 1 de 15 archivo(s) fuente)_

Citadas en el cierre común de las escrituras:

- Ley 1581 de 2012 y Decreto 1377 de 2013 (datos personales)
- Decreto 960 de 1970, art. 35 (corrección de errores por nueva escritura)
- Ley 223 de 1995, art. 232 y Decreto 650 de 1996, art. 14 (plazo de registro de dos meses)
- Decreto 2148 de 1983, art. 9 (otorgamiento en diferentes momentos)
- Decreto 830 de 2021 (personas expuestas políticamente – formato de firmas)
- Ley 2010 de 2019, art. 61 (declaración del precio real)
- Ley 2097 de 2021 y Decreto 1310 de 2022 (constancia REDAM)
