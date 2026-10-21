# Ficha: Compraventa con subsidio de vivienda (VIS/VIP)

- **Identificador:** `compraventa_vis`
- **Categoría:** A. Actos sobre inmuebles
- **Prioridad:** Alta
- **Estado en la carpeta:** ⚠️ Existe con problemas
- **Estado de aprobación:** Pendiente de aprobación del notario

## Archivo(s) fuente

- **F08** – 16 - SALAMANCA - BERDEZ - [M.V.V.]  
  Proyecto VIS con fiducia (Fiduciaria Central) y constructora; hipoteca BBVA; protocolización del certificado técnico de ocupación.
- **F10** – 2 - APARTAMENTO - TORRES DE IPACARAI - UNION LIBRE - CAJA HONOR - PODER ← **fuente sugerida para la plantilla**  
  Apartamento en PH; recursos de Caja Promotora de Vivienda Militar (Caja Honor); vendedora con apoderada; compradores en unión libre.
- **F12** – 2 - CONSTRUESPACIOS - VALLE DE SORENTO - [C.A.L.V.] - COLSUBSIDIO - DR. [R.]  
  VIS con fiducia (Acción Fiduciaria) y Construespacios; subsidio Colsubsidio; hipoteca Bancolombia.
- **F23** – 290 - CASA HABITACION - CASADO - CAJA HONOR (NUEVO) - PODER  
  Recursos Caja Honor; comprador casado que afecta; vendedores representados; porcentajes de exógena.
- **F25** – 3 - ALTAIR APARTAMENTOS - (INVERSIONES DIAZ) - [Y.P.G.] - COMFAMILIAR  
  VIS con fiducia (Aval Fiduciaria); liberación parcial de hipoteca del Banco de Bogotá; hipoteca nueva a favor del Fondo Nacional del Ahorro; subsidio Comfamiliar.
- **F27** – 3 - CONSTRUESPACIOS - VALLE DE GENOVA - [H.J.P.V.] - COMFAMILIAR  
  VIS (Acción Fiduciaria/Construespacios); subsidio Comfamiliar; hipoteca Banco Caja Social.
- **F40** – 392 - CONSTRUESPACIOS - VALLE DE SORENTO - [J.R.M.C.] - COLSUBSIDIO  
  VIS Colsubsidio sin hipoteca.
- **F41** – 393 - SAN AGUSTIN - CANCELACION AFECTACION - UNION LIBRE - CAJA HONOR (NUEVO) - PODER  
  Recursos Caja Honor; inmueble en Cundinamarca (ORIP Agua de Dios); apoderada.
- **F46** – 4 - RDG CONSTRUCCIONES SAS ETAPA II - [J.R.C.] - COMFAMILIAR - DRA. [S.]  
  VIS RDG Construcciones; subsidio Comfamiliar; hipoteca Davivienda; protocolización de certificado técnico de ocupación.
- **F62** – 6 - CONSTRUESPACIOS - VALLE DE GENOVA - [M.M.G.M.] - COMFAMILIAR  
  VIS (Acción Fiduciaria/Construespacios); subsidio Comfamiliar; hipoteca Davivienda.
- **F65** – 7 - RDG CONSTRUCCIONES SAS ETAPA II - [Y.C.L.O.] - COLSUBSIDIO  
  VIS RDG Construcciones; subsidio Colsubsidio; hipoteca BBVA; protocolización de CTO.

## Actos que incluye

- No aparece como escritura independiente.
- Combinaciones observadas en la carpeta:
  - Declaración de construcción o mejoras + Compraventa con subsidio de vivienda (VIS/VIP) + Hipoteca abierta (sin límite de cuantía) y cerrada + Constitución de patrimonio de familia inembargable + Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.)
  - Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de afectación a vivienda familiar
  - Compraventa con subsidio de vivienda (VIS/VIP) + Hipoteca abierta (sin límite de cuantía) y cerrada + Constitución de patrimonio de familia inembargable
  - Liberación parcial de hipoteca + Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.) + Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de patrimonio de familia inembargable + Hipoteca abierta (sin límite de cuantía) y cerrada
  - Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de patrimonio de familia inembargable + Hipoteca abierta (sin límite de cuantía) y cerrada
  - Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de patrimonio de familia inembargable
  - Cancelación de afectación a vivienda familiar + Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de afectación a vivienda familiar
  - Compraventa con subsidio de vivienda (VIS/VIP) + Hipoteca abierta (sin límite de cuantía) y cerrada + Constitución de patrimonio de familia inembargable + Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.)

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
| `vendedor_fiduciaria` | entidad | Fiduciaria como vocera del patrimonio autónomo (NIT del fideicomiso) | No |
| `fideicomitente_desarrollador` | entidad | Constructora | No |
| `subsidio_entidad` | texto | Comfamiliar, Colsubsidio, Caja Honor, Mi Casa Ya, etc. | Sí |
| `subsidio_valor` | moneda |  | Sí |
| `subsidio_acto_asignacion` | texto | Acta/resolución/oficio y fecha | Sí |
| `recursos_propios_credito_cesantias` | moneda | La suma de fuentes debe igualar el precio | Sí |
| `licencia_construccion` | texto | Resolución de la curaduría | No |
| `certificado_tecnico_ocupacion` | texto | Se protocoliza cuando aplica (Ley 1796 de 2016 citada en las minutas) | No |
| `prohibicion_enajenar_condicion_resolutoria` | booleano | Cláusula de restitución del subsidio | Sí |
| `constituyente` | persona |  | Sí |
| `beneficiarios` | texto | Constituyente, cónyuge/compañero, hijos menores y por nacer | Sí |
| `hipotecantes` | lista | Deudores/propietarios | Sí |
| `acreedor` | persona/entidad | Banco, fondo o persona natural | Sí |
| `tipo_hipoteca` | enum | ABIERTA SIN LÍMITE DE CUANTÍA \| ABIERTA DE PRIMER GRADO PARA VIVIENDA \| CERRADA | Sí |
| `cuantia_credito` | moneda | Valor para derechos notariales; letras automáticas | Sí |
| `minuta_entidad` | documento | Si el acreedor es entidad financiera, el texto lo aporta la entidad ("HASTA AQUÍ LA MINUTA PRESENTADA") | No |

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
- Carta/acta de asignación del subsidio
- Certificado de la fiduciaria y del fideicomiso
- Licencia de construcción
- Certificado técnico de ocupación (si aplica)
- Minuta de la entidad financiera (si hay crédito)

## Comparecientes

Fiduciaria (vocera del patrimonio autónomo), constructora/fideicomitente, comprador(es), entidad financiera

## Problemas detectados en las fuentes

- **F08:** Combina 5 actos: Declaración de construcción o mejoras + Compraventa con subsidio de vivienda (VIS/VIP) + Hipoteca abierta (sin límite de cuantía) y cerrada + Constitución de patrimonio de familia inembargable + Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.). · Compradora representada por apoderada.
- **F10:** Combina 2 actos: Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de afectación a vivienda familiar.
- **F12:** Combina 3 actos: Compraventa con subsidio de vivienda (VIS/VIP) + Hipoteca abierta (sin límite de cuantía) y cerrada + Constitución de patrimonio de familia inembargable. · Misma minuta de constructora que F40 (59 %).
- **F23:** Combina 2 actos: Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de afectación a vivienda familiar.
- **F25:** Combina 5 actos: Liberación parcial de hipoteca + Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.) + Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de patrimonio de familia inembargable + Hipoteca abierta (sin límite de cuantía) y cerrada.
- **F27:** Combina 3 actos: Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de patrimonio de familia inembargable + Hipoteca abierta (sin límite de cuantía) y cerrada. · Versión del mismo modelo que F62 (71 %); difieren en el banco.
- **F40:** Combina 2 actos: Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de patrimonio de familia inembargable. · Borrador: número y fecha de escritura sin asignar
- **F41:** Combina 3 actos: Cancelación de afectación a vivienda familiar + Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de afectación a vivienda familiar. · Borrador: número y fecha de escritura sin asignar
- **F46:** Combina 4 actos: Compraventa con subsidio de vivienda (VIS/VIP) + Hipoteca abierta (sin límite de cuantía) y cerrada + Constitución de patrimonio de familia inembargable + Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.). · Mismo modelo de constructora que F65.
- **F62:** Combina 3 actos: Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de patrimonio de familia inembargable + Hipoteca abierta (sin límite de cuantía) y cerrada. · Versión del mismo modelo que F27 (71 %). · Borrador: número y fecha de escritura sin asignar
- **F65:** Combina 4 actos: Compraventa con subsidio de vivienda (VIS/VIP) + Hipoteca abierta (sin límite de cuantía) y cerrada + Constitución de patrimonio de familia inembargable + Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.).
- **Todas:** son escrituras reales con datos personales; se trabajó sobre copias anonimizadas en `datos_locales/copias_trabajo/`.

## Referencia normativa – pendiente de validar por el notario

> Normas **citadas en los textos de la notaría** para este tipo. Se registran como referencia; **no se afirma su vigencia** ni su aplicabilidad. El notario debe validarlas.

- Ley 258 de 1996 _(citada en 19 de 11 archivo(s) fuente)_
- Ley 854 de 2003 _(citada en 11 de 11 archivo(s) fuente)_
- Ley 675 de 2001 _(citada en 9 de 11 archivo(s) fuente)_
- Decreto 2190 de 2009 _(citada en 9 de 11 archivo(s) fuente)_
- Ley 14 de 1983 _(citada en 8 de 11 archivo(s) fuente)_
- Ley 3 de 1991 _(citada en 8 de 11 archivo(s) fuente)_
- Ley 9 de 1989 _(citada en 8 de 11 archivo(s) fuente)_
- Decreto 2106 de 2019 _(citada en 8 de 11 archivo(s) fuente)_
- Ley 1537 de 2012 _(citada en 7 de 11 archivo(s) fuente)_
- Ley 2079 de 2021 _(citada en 7 de 11 archivo(s) fuente)_
- Ley 1395 de 2010 _(citada en 6 de 11 archivo(s) fuente)_
- Ley 1796 de 2016 _(citada en 5 de 11 archivo(s) fuente)_
- Ley 546 de 1999 _(citada en 5 de 11 archivo(s) fuente)_
- Ley 788 de 2002 _(citada en 5 de 11 archivo(s) fuente)_
- Código Civil _(citada en 4 de 11 archivo(s) fuente)_
- Código General del Proceso (Ley 1564 de 2012) _(citada en 4 de 11 archivo(s) fuente)_
- Decreto 2180 de 2006 _(citada en 4 de 11 archivo(s) fuente)_
- Ley 142 de 1994 _(citada en 4 de 11 archivo(s) fuente)_
- Ley 1480 de 2011 _(citada en 4 de 11 archivo(s) fuente)_
- Ley 962 de 2005 _(citada en 4 de 11 archivo(s) fuente)_
- Ley 1676 de 2013 _(citada en 3 de 11 archivo(s) fuente)_
- Decreto 1070 de 2015 _(citada en 3 de 11 archivo(s) fuente)_
- Ley 1579 de 2012 _(citada en 3 de 11 archivo(s) fuente)_
- Decreto 1074 de 2015 _(citada en 2 de 11 archivo(s) fuente)_
- Decreto 1297 de 2022 _(citada en 2 de 11 archivo(s) fuente)_
- Ley 1116 de 2006 _(citada en 2 de 11 archivo(s) fuente)_
- Ley 1266 de 2008 _(citada en 2 de 11 archivo(s) fuente)_
- Ley 1564 de 2012 _(citada en 2 de 11 archivo(s) fuente)_
- Decreto 2555 de 2010 _(citada en 2 de 11 archivo(s) fuente)_
- Ley 338 de 1997 _(citada en 2 de 11 archivo(s) fuente)_
- Ley 1305 de 2009 _(citada en 2 de 11 archivo(s) fuente)_
- Decreto 1069 de 2015 _(citada en 2 de 11 archivo(s) fuente)_
- Ley 66 de 1968 _(citada en 2 de 11 archivo(s) fuente)_
- Decreto 1604 de 1966 _(citada en 1 de 11 archivo(s) fuente)_
- Decreto 1664 de 2015 _(citada en 1 de 11 archivo(s) fuente)_
- Decreto 1962 de 2023 _(citada en 1 de 11 archivo(s) fuente)_
- Decreto Ley 3118 de 1968 _(citada en 1 de 11 archivo(s) fuente)_
- Ley 2010 de 2019 _(citada en 1 de 11 archivo(s) fuente)_
- Ley 432 de 1998 _(citada en 1 de 11 archivo(s) fuente)_

_Nota: este tipo solo aparece combinado; la lista puede incluir normas de los otros actos de esas escrituras._

Citadas en el cierre común de las escrituras:

- Ley 1581 de 2012 y Decreto 1377 de 2013 (datos personales)
- Decreto 960 de 1970, art. 35 (corrección de errores por nueva escritura)
- Ley 223 de 1995, art. 232 y Decreto 650 de 1996, art. 14 (plazo de registro de dos meses)
- Decreto 2148 de 1983, art. 9 (otorgamiento en diferentes momentos)
- Decreto 830 de 2021 (personas expuestas políticamente – formato de firmas)
- Ley 2010 de 2019, art. 61 (declaración del precio real)
- Ley 2097 de 2021 y Decreto 1310 de 2022 (constancia REDAM)
