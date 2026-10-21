# Ficha: Terminación de acuerdo de apoyo

- **Identificador:** `terminacion_acuerdo_apoyo`
- **Categoría:** D. Poderes, apoyos y voluntad anticipada
- **Prioridad:** Baja
- **Estado en la carpeta:** ⚠️ Existe con problemas
- **Estado de aprobación:** Pendiente de aprobación del notario
- **Origen:** tipo no incluido en el catálogo base; encontrado en la carpeta.

## Archivo(s) fuente

- **F72** – TERMINACION ACUERDO DE APOYO OK ← **fuente sugerida para la plantilla**  
  Terminación unilateral del acuerdo de apoyos (art. 20 Ley 1996 de 2019 citado).

## Actos que incluye

- Como escritura independiente: F72.

## Variables

### Específicas del acto

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `titular_acto` | persona |  | Sí |
| `acuerdo_apoyo` | texto | Escritura del acuerdo (número, fecha, notaría) | Sí |
| `personas_apoyo` | lista | A quienes se comunica la terminación | Sí |

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

**Cierre**

| Variable | Tipo | Validación | Obligatoria |
| --- | --- | --- | --- |
| `hojas_papel_notarial` | lista | Códigos Aa######### – se diligencian al imprimir | No |
| `derechos_notariales` | moneda | Derechos, IVA, Fondo, Superintendencia – se liquidan en caja | No |
| `resolucion_tarifas` | texto | Resolución de tarifas vigente del año (en 2026: "Resolución No. 2026-000964-6 del 20 de Enero de 2026") | Sí |
| `codigo_minuta` | texto | Pie interno, p. ej. "COMPRAVENTA 410/ MILAN" | No |

## Documentos soporte requeridos

- Escritura del acuerdo de apoyo
- Solicitud
- Documento de identidad

## Comparecientes

Titular del acto

## Problemas detectados en las fuentes

- **F72:** Fecha, domicilio y actividad económica sin diligenciar. · Texto arrastrado de otra minuta: "aceptan… la MODIFICACIÓN". · Error de digitación: "identificadasmanifiestan". · Espacio sin diligenciar: día de otorgamiento · Espacio sin diligenciar: domicilio/residencia · Borrador: número y fecha de escritura sin asignar
- **Todas:** son escrituras reales con datos personales; se trabajó sobre copias anonimizadas en `datos_locales/copias_trabajo/`.

## Referencia normativa – pendiente de validar por el notario

> Normas **citadas en los textos de la notaría** para este tipo. Se registran como referencia; **no se afirma su vigencia** ni su aplicabilidad. El notario debe validarlas.

- Decreto 1069 de 2015 _(citada en 1 de 1 archivo(s) fuente)_
- Decreto 1429 de 2020 _(citada en 1 de 1 archivo(s) fuente)_
- Ley 1996 de 2019 _(citada en 1 de 1 archivo(s) fuente)_

Citadas en el cierre común de las escrituras:

- Ley 1581 de 2012 y Decreto 1377 de 2013 (datos personales)
- Decreto 960 de 1970, art. 35 (corrección de errores por nueva escritura)
- Ley 223 de 1995, art. 232 y Decreto 650 de 1996, art. 14 (plazo de registro de dos meses)
- Decreto 2148 de 1983, art. 9 (otorgamiento en diferentes momentos)
- Decreto 830 de 2021 (personas expuestas políticamente – formato de firmas)
