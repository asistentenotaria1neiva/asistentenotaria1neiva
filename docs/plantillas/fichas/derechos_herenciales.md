# Ficha: Compraventa de derechos herenciales o cesión de derechos herenciales

- **Identificador:** `derechos_herenciales`
- **Categoría:** A. Actos sobre inmuebles
- **Prioridad:** Media
- **Estado en la carpeta:** ⚠️ Existe con problemas
- **Estado de aprobación:** Pendiente de aprobación del notario

## Archivo(s) fuente

- **F33** – 336 - DERECHOS HERENCIALES UNIVERSAL - PORCENTAJE  
  Título universal por porcentaje.
- **F36** – 364 - DERECHOS HERENCIALES UNIVERSAL  
  Título universal (hijo del causante).
- **F50** – 407 - DERECHOS HERENCIALES SINGULAR - ELABORO [C.] ← **fuente sugerida para la plantilla**  
  Título singular sobre un inmueble determinado.
- **F51** – 408 - DERECHOS HERENCIALES UNIVERSAL - PADRES Y ABUELOS  
  Varios vendedores (12.5 % c/u); herencias de padres y abuelos.

## Actos que incluye

- Como escritura independiente: F33, F36, F50, F51.

## Variables

### Específicas del acto

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `causante` | persona | Nombre, cédula, fecha y lugar de defunción | Sí |
| `parentesco_vendedor` | texto | Calidad de heredero acreditada con registros civiles | Sí |
| `modalidad` | enum | TÍTULO UNIVERSAL \| TÍTULO SINGULAR (sobre inmueble determinado) \| PORCENTAJE | Sí |
| `porcentaje` | porcentaje | Si se vende un porcentaje | No |

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

- Registro civil de defunción del causante
- Registros civiles que acrediten parentesco
- Documentos de identidad
- Certificado de tradición (si es a título singular)

## Comparecientes

Heredero(s) cedente(s), cesionario(s)

## Problemas detectados en las fuentes

- **F33:** Versión del mismo modelo que F36 (75 %).
- **F36:** Error en la fecha: "VEITISEIS".
- **F51:** Borrador: número y fecha de escritura sin asignar
- **Todas:** son escrituras reales con datos personales; se trabajó sobre copias anonimizadas en `datos_locales/copias_trabajo/`.

## Referencia normativa – pendiente de validar por el notario

> Normas **citadas en los textos de la notaría** para este tipo. Se registran como referencia; **no se afirma su vigencia** ni su aplicabilidad. El notario debe validarlas.

- No se encontraron citas normativas específicas en las fuentes de este tipo.

Citadas en el cierre común de las escrituras:

- Ley 1581 de 2012 y Decreto 1377 de 2013 (datos personales)
- Decreto 960 de 1970, art. 35 (corrección de errores por nueva escritura)
- Ley 223 de 1995, art. 232 y Decreto 650 de 1996, art. 14 (plazo de registro de dos meses)
- Decreto 2148 de 1983, art. 9 (otorgamiento en diferentes momentos)
- Decreto 830 de 2021 (personas expuestas políticamente – formato de firmas)
- Ley 2010 de 2019, art. 61 (declaración del precio real)
- Ley 2097 de 2021 y Decreto 1310 de 2022 (constancia REDAM)
