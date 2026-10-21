# Ficha: Compraventa de derechos de cuota (cuota parte)

- **Identificador:** `compraventa_cuota`
- **Categoría:** A. Actos sobre inmuebles
- **Prioridad:** Media
- **Estado en la carpeta:** ⚠️ Existe con problemas
- **Estado de aprobación:** Pendiente de aprobación del notario

## Archivo(s) fuente

- **F15** – 205 - LOTE SIN CONSTRUCCION - DERECHO CUOTA - [R.D.C.T. y E.M.M.S.]  
  Derecho de cuota sobre lote.
- **F54** – 416 - LOTE SIN CONSTRUCCION - DERECHO CUOTA ← **fuente sugerida para la plantilla**  
  Derecho de cuota sobre lote urbano.
- **F67** – 9 - LOTE SIN CONSTRUCCION - DERECHO CUOTA - ASOCIACION DE PEQUEÑOS PRODUCTORES … DE POTOSI  
  Derecho de cuota; compra una asociación (entidad sin ánimo de lucro).
- **F69** – DERECHOS DE CUOTA CAMPOALEGRE [A. y M.C.]  
  Cuota del 94.64 %; vendedora representada; hipoteca subsistente con advertencia notarial (art. 2433 C.C.).

## Actos que incluye

- Como escritura independiente: F15, F54, F67, F69.

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
| `porcentaje_o_fraccion` | porcentaje | Ej. 94.64 % o 1/11; la suma de cuotas no puede superar 100 % | Sí |
| `comuneros` | lista | Titulares actuales según certificado | Sí |

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

## Comparecientes

Comunero(s) vendedor(es), comprador(es)

## Problemas detectados en las fuentes

- **F54:** Borrador: número y fecha de escritura sin asignar
- **F67:** El pie no tiene código de minuta. · Borrador: número y fecha de escritura sin asignar
- **F69:** Formato distinto al estándar (otro elaborador). · Doble espacio en el nombre del archivo. · Borrador: número y fecha de escritura sin asignar
- **Todas:** son escrituras reales con datos personales; se trabajó sobre copias anonimizadas en `datos_locales/copias_trabajo/`.

## Referencia normativa – pendiente de validar por el notario

> Normas **citadas en los textos de la notaría** para este tipo. Se registran como referencia; **no se afirma su vigencia** ni su aplicabilidad. El notario debe validarlas.

- Ley 258 de 1996 _(citada en 4 de 4 archivo(s) fuente)_
- Ley 854 de 2003 _(citada en 4 de 4 archivo(s) fuente)_
- Ley 14 de 1983 _(citada en 1 de 4 archivo(s) fuente)_
- Código Civil _(citada en 1 de 4 archivo(s) fuente)_
- Decreto 1711 de 1984 _(citada en 1 de 4 archivo(s) fuente)_

Citadas en el cierre común de las escrituras:

- Ley 1581 de 2012 y Decreto 1377 de 2013 (datos personales)
- Decreto 960 de 1970, art. 35 (corrección de errores por nueva escritura)
- Ley 223 de 1995, art. 232 y Decreto 650 de 1996, art. 14 (plazo de registro de dos meses)
- Decreto 2148 de 1983, art. 9 (otorgamiento en diferentes momentos)
- Decreto 830 de 2021 (personas expuestas políticamente – formato de firmas)
- Ley 2010 de 2019, art. 61 (declaración del precio real)
- Ley 2097 de 2021 y Decreto 1310 de 2022 (constancia REDAM)
