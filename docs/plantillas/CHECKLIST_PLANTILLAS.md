# Checklist de plantillas – Notaría Primera del Círculo de Neiva

Generado el 2026-10-20 por la Fase 0 del proyecto (Automind). Fuente: carpeta `Plantillas Notaria 1` (solo lectura; no se modificó ningún archivo).

## Resumen

- **Archivos encontrados:** 72 (todos .docx, en una sola carpeta, sin subcarpetas). Todos se leyeron completos; ninguno está vacío o dañado.
- **Tipos en el catálogo:** 61 (56 del catálogo base, con afectación y patrimonio de familia separados en constitución y cancelación, + 5 tipos nuevos encontrados en la carpeta).
- **Tipos cubiertos:** 26 · **Tipos faltantes:** 35.
- **Archivos sin clasificar:** 0 (todos se clasificaron por su contenido).
- **Archivos con errores críticos:** 2 (F70, F71).

### Hallazgo principal

**Ninguno de los 72 archivos es una minuta limpia.** Todos son escrituras ya elaboradas para casos reales (2025‑2026), con nombres, cédulas, matrículas, direcciones y valores. Por eso todos los tipos existentes quedan en estado `⚠️ Existe con problemas` hasta que se conviertan en plantillas con variables y el notario las apruebe (Fase 1).

Otros hallazgos:

- **Las escrituras son modulares.** Cada una tiene carátula → "PRIMER ACTO", "SEGUNDO ACTO"… → cierre común (datos personales, advertencias, otorgamiento, firmas con formato PEP). 30 de los 72 archivos combinan 2 o más actos. El sistema debe armar la escritura por bloques de acto y no tener una plantilla por cada combinación.
- **Las hipotecas a favor de entidades financieras son minutas del banco** ("HASTA AQUÍ LA MINUTA PRESENTADA"): Banco de Bogotá, Banco Agrario, BBVA, Davivienda, Bancolombia, Banco Caja Social y Fondo Nacional del Ahorro. Se manejarán como bloques de texto externos por entidad, versionados.
- **El nombre del archivo no siempre describe el contenido**: "ESCRITURA SUCESION EN VIDA2" es una *partición del patrimonio en vida* (no es una sucesión); los archivos "MENOR (1)" son *autorizaciones de salida del país*; el número inicial del nombre coincide con el código interno de la minuta del pie ("COMPRAVENTA 410/ MILAN").
- **Fechas de modificación:** todos los archivos muestran 2026-10-19 (sincronización de OneDrive), así que la fecha no sirve para saber cuál versión es la más reciente. Las versiones se compararon por contenido.
- **Errores reales encontrados** que la aplicación debe atrapar: cédula distinta entre carátula y cuerpo (F70), total de hijuela mal escrito "$466.8666.000" (F71), espacios sin diligenciar (F70, F71, F72), palabras mal escritas en fechas ("VEITISEIS", "VEITNISEIS", "SESIS"), texto arrastrado de otra minuta (F72).

- **Cifras en letras vs. números:** se compararon 143 cifras; no hubo diferencias.

## Plantillas que la notaría debe entregar (faltantes), por prioridad

**Prioridad Alta**

- [ ] Sucesión intestada (liquidación de herencia) _(Sucesiones y testamentos)_
- [ ] Sucesión testada _(Sucesiones y testamentos)_
- [ ] Sucesión con liquidación de sociedad conyugal o patrimonial _(Sucesiones y testamentos)_
- [ ] Poder general _(Poderes, apoyos y voluntad anticipada)_
- [ ] Poder especial por escritura pública _(Poderes, apoyos y voluntad anticipada)_

**Prioridad Media**

- [ ] Ampliación o modificación de hipoteca _(Actos sobre inmuebles)_
- [ ] Donación (incluida la insinuación notarial cuando aplique) _(Actos sobre inmuebles)_
- [ ] Desenglobe / división material _(Actos sobre inmuebles)_
- [ ] Actualización o corrección de área y linderos _(Actos sobre inmuebles)_
- [ ] Leasing habitacional (transferencia o restitución) _(Actos sobre inmuebles)_
- [ ] Matrimonio civil _(Familia y estado civil)_
- [ ] Cambio de nombre _(Familia y estado civil)_
- [ ] Corrección del registro civil _(Familia y estado civil)_
- [ ] Testamento abierto _(Sucesiones y testamentos)_
- [ ] Revocatoria de poder _(Poderes, apoyos y voluntad anticipada)_
- [ ] Acuerdo de apoyo para la toma de decisiones _(Poderes, apoyos y voluntad anticipada)_

**Prioridad Baja**

- [ ] Compraventa de nuda propiedad / reserva de usufructo _(Actos sobre inmuebles)_
- [ ] Permuta _(Actos sobre inmuebles)_
- [ ] Dación en pago _(Actos sobre inmuebles)_
- [ ] Aporte de inmueble a sociedad _(Actos sobre inmuebles)_
- [ ] Constitución y cancelación de usufructo _(Actos sobre inmuebles)_
- [ ] Constitución de servidumbre _(Actos sobre inmuebles)_
- [ ] Englobe _(Actos sobre inmuebles)_
- [ ] Loteo / subdivisión _(Actos sobre inmuebles)_
- [ ] Reglamento de propiedad horizontal _(Actos sobre inmuebles)_
- [ ] Reforma del reglamento de propiedad horizontal _(Actos sobre inmuebles)_
- [ ] Fiducia mercantil sobre inmuebles _(Actos sobre inmuebles)_
- [ ] Capitulaciones matrimoniales _(Familia y estado civil)_
- [ ] Reconocimiento de hijo extramatrimonial _(Familia y estado civil)_
- [ ] Corrección del componente sexo en el registro civil _(Familia y estado civil)_
- [ ] Testamento cerrado _(Sucesiones y testamentos)_
- [ ] Revocatoria de testamento _(Sucesiones y testamentos)_
- [ ] Constitución de sociedad _(Sociedades y otros actos)_
- [ ] Reforma de estatutos _(Sociedades y otros actos)_
- [ ] Disolución y liquidación de sociedad _(Sociedades y otros actos)_

Además, para los tipos que sí existen, la notaría debería confirmar **cuál es la versión vigente** de cada minuta (ver "Fuente sugerida" en la tabla) y entregar las **minutas bancarias vigentes** de cada entidad con la que trabaja.

## Archivos con problemas que el notario debe revisar

Primero los que tienen errores **críticos**; luego los demás con observaciones propias (además de contener datos reales, lo que aplica a todos).

- **F70** – ESCRI. DIRECTIVA ANTICIPADA Y ADJUDICACION DE APOYOS [J.] OK.2 🔴
  - CRÍTICO: la cédula del titular en la carátula no coincide con la del cuerpo (difieren todos los dígitos).
  - Estado civil del titular y de la persona de apoyo sin diligenciar.
  - Cita la resolución de tarifas de 2024 (desactualizada).
  - Falta el formato PEP en las firmas.
  - Contiene número de cuenta bancaria real.
  - CRÍTICO: el documento de un compareciente en la carátula no aparece en el cuerpo
  - Espacio sin diligenciar: estado civil
- **F71** – ESCRITURA SUCESION EN VIDA2 🔴
  - CRÍTICO: total de la hijuela segunda escrito como "$466.8666.000" (cifra mal formada y además debería ser $963.169.500).
  - Errores: "TOAL ADJUDICADO", "ADJUDICAICÓN", numeral "6.1.2" repetido en la segunda hijuela.
  - Llama "causante" a la asignante, que está viva.
  - Concordancia: "domiciliada" para el apoderado (hombre).
  - Estado civil y actividad económica de la asignante sin diligenciar; día de otorgamiento "(__)".
  - Falta la resolución de tarifas y el formato PEP.
  - Espacio sin diligenciar: estado civil
  - Espacio sin diligenciar: actividad económica
  - Espacio sin diligenciar: día de otorgamiento
  - CRÍTICO: cifra mal formada (grupo de miles con 4 dígitos)
- **F02** – 10 - CIUDADELA SALAMANCA LA NUEVA VIS - [N.C.C.G.] - CANCELACION PATRIMONIO - DR. [W.]
  - Minuta de hipoteca del Banco de Bogotá casi idéntica a F63 y F64 (82 % y 79 % de similitud).
- **F04** – 12 - MENOR (1) - TODOS LOS PAISES
  - La lista de países se repite 3 veces dentro del texto (sería una variable de lista).
  - Similar a F60 (64 %).
- **F08** – 16 - SALAMANCA - BERDEZ - [M.V.V.]
  - Compradora representada por apoderada.
- **F12** – 2 - CONSTRUESPACIOS - VALLE DE SORENTO - [C.A.L.V.] - COLSUBSIDIO - DR. [R.]
  - Misma minuta de constructora que F40 (59 %).
- **F14** – 2 - UNION LIBRE
  - Similar a F01 (61 %).
- **F21** – 285 - BODEGAS BLOQUE B - SURABASTOS
  - Encabezado cita al notario titular pero la firma es de la notaria encargada (verificar).
  - Hipoteca anterior mencionada: verificar que la plantilla no la traslade a otros casos.
- **F24** – 292 - CASA HABITACION - CANCELACION AFECTACION - COMPRA MENOR
  - En la carátula aparece "P. M. Q." con una cédula y "L. P. M. Q." con otra: verificar si son la misma persona (posible error de identificación).
- **F27** – 3 - CONSTRUESPACIOS - VALLE DE GENOVA - [H.J.P.V.] - COMFAMILIAR
  - Versión del mismo modelo que F62 (71 %); difieren en el banco.
- **F30** – 306 - LOCAL - CENTRO COMERCIAL LAS AMERICAS - CANCELACION HIPOTECA BANCOLOMBIA - DRA. [A.M.]
  - Menciona otra hipoteca (Banco Popular) asumida por el vendedor: revisar.
- **F32** – 32 - OCCIDENTE ABSORBIO LEASING DE OCCIDENTE S.A
  - Doble espacio en el nombre del archivo.
- **F33** – 336 - DERECHOS HERENCIALES UNIVERSAL - PORCENTAJE
  - Versión del mismo modelo que F36 (75 %).
- **F34** – 35 - BANCO MUNDO MUJER - [F.Z.A.]
  - Unas cancelaciones van "sin cuantía" y otras "con cuantía": el notario debe fijar el criterio.
- **F36** – 364 - DERECHOS HERENCIALES UNIVERSAL
  - Error en la fecha: "VEITISEIS".
- **F37** – 385 - CASA HABITACION - UNION LIBRE NO AFECTA
  - Error en la fecha: "VEITNISEIS".
- **F45** – 4 - DECLARACION SOCIEDAD PATRIMONIAL - LIQUIDACION EN 0 - SIN HIJOS - [S.L.L.]
  - Cita la resolución de tarifas de 2025 (versión anterior).
- **F46** – 4 - RDG CONSTRUCCIONES SAS ETAPA II - [J.R.C.] - COMFAMILIAR - DRA. [S.]
  - Mismo modelo de constructora que F65.
- **F47** – 400 - CASA HABITACION - CANCELACION PATRIMONIO SOLTERA (HIJOS MAYORES) - DECLARACION CONSTRUCCION (RECONOCIMIENTO) - SOLTERA
  - Error en la fecha: "SESIS (06)".
- **F49** – 406 - LOTE SIN CONSTRUCCION - [R.] (RIVERA) - LOTE 24
  - Duplicado casi exacto de F55 (83 %): mismo vendedor, distinto lote.
- **F52** – 410 - CASA HABITACION - SOLTERA
  - Versión del mismo modelo que F58 (70 %).
- **F55** – 417 - LOTE SIN CONSTRUCCION - [R.] (RIVERA) - LOTE 40
  - Duplicado casi exacto de F49 (83 %).
- **F58** – 420 - CASA HABITACION - SOLTERA
  - Duplicado/versión de F52 (70 %).
- **F62** – 6 - CONSTRUESPACIOS - VALLE DE GENOVA - [M.M.G.M.] - COMFAMILIAR
  - Versión del mismo modelo que F27 (71 %).
- **F63** – 6 - SAN TELMO ETAPA 4 - [E.H.F.R.] - DR. [W.]
  - Mismo modelo que F02 y F64.
- **F64** – 7 - APARTAMENTO - ENTRE RIOS ETAPA I - CANCELACION CONDICION 5 AÑOS - CANCELACION PATRIMONIO SOLTERO - DR. [W.]
  - Mismo modelo bancario que F02 y F63.
- **F66** – 8 - (NUEVO) - DECLARACION UNION MARITAL - DECLARACION SOCIEDAD PATRIMONIAL - LIQUIDACION CON ACTIVOS
  - Se verificó la suma de hijuelas: cuadra ($231.838.000 + $25.000.000 = $256.838.000).
- **F67** – 9 - LOTE SIN CONSTRUCCION - DERECHO CUOTA - ASOCIACION DE PEQUEÑOS PRODUCTORES … DE POTOSI
  - El pie no tiene código de minuta.
- **F68** – CANCELACION PATRIMONIO FAMILIA Y COMPRAVENTA [K.]2
  - Formato distinto al estándar de la notaría (elaborado por otra persona).
  - Cifra mal escrita: "$150.000. 000.oo".
  - Cancelación con beneficiaria menor: la sustitución del patrimonio queda para otra escritura – requiere validación jurídica del notario.
  - Títulos de actos: aparece "PRIMER ACTO" y "TERCER ACTO" (revisar numeración).
  - Cifra con espacio dentro del número
- **F69** – DERECHOS DE CUOTA CAMPOALEGRE [A. y M.C.]
  - Formato distinto al estándar (otro elaborador).
  - Doble espacio en el nombre del archivo.
- **F72** – TERMINACION ACUERDO DE APOYO OK
  - Fecha, domicilio y actividad económica sin diligenciar.
  - Texto arrastrado de otra minuta: "aceptan… la MODIFICACIÓN".
  - Error de digitación: "identificadasmanifiestan".
  - Espacio sin diligenciar: día de otorgamiento
  - Espacio sin diligenciar: domicilio/residencia

### Archivos sin clasificar

Ninguno.

## Checklist por tipo de escritura

| Categoría | Tipo de escritura | Estado | Archivo(s) en la carpeta | Variables detectadas | Observaciones | Prioridad |
| --- | --- | --- | --- | --- | --- | --- |
| A. Actos sobre inmuebles | [Compraventa de inmueble](fichas/compraventa.md) | ⚠️ Existe con problemas | F17, F18, F21, F22, F24, F26, F30, F31, F35, F37, F38, F39, F42, F47, F48, F49, F52, F53, F55, F56, F57, F58, F68 | `vendedores`, `compradores`, `precio`, `forma_pago`, `afectacion_vivienda_familiar`, `gravamenes_subsistentes`, `constancia_redam`, `venta_cuerpo_cierto` | Independiente en: F17, F18, F21, F22, F26, F31, F37, F39, F42, F49, F52, F53, F55, F57, F58. Combinado en: F24, F30, F35, F38, F47, F48, F56, F68. Fuente sugerida para la plantilla: F52. Duplicados: F49≈F55, F55≈F49, F58≈F52. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Alta |
| A. Actos sobre inmuebles | [Compraventa con constitución de hipoteca](fichas/compraventa_hipoteca.md) | ⚠️ Existe con problemas | F02, F09, F19, F43, F63, F64 | `vendedores`, `compradores`, `precio`, `forma_pago`, `afectacion_vivienda_familiar`, `gravamenes_subsistentes`, `constancia_redam`, `venta_cuerpo_cierto`, `hipotecantes`, `acreedor`, `tipo_hipoteca`, `cuantia_credito`, `minuta_entidad` | Independiente en: F09, F43, F63. Combinado en: F02, F19, F64. Fuente sugerida para la plantilla: F63. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Alta |
| A. Actos sobre inmuebles | [Compraventa con subsidio de vivienda (VIS/VIP)](fichas/compraventa_vis.md) | ⚠️ Existe con problemas | F08, F10, F12, F23, F25, F27, F40, F41, F46, F62, F65 | `vendedores`, `compradores`, `precio`, `forma_pago`, `afectacion_vivienda_familiar`, `gravamenes_subsistentes`, `constancia_redam`, `venta_cuerpo_cierto`, `vendedor_fiduciaria`, `fideicomitente_desarrollador`, `subsidio_entidad`, `subsidio_valor`, `subsidio_acto_asignacion`, `recursos_propios_credito_cesantias`, `licencia_construccion`, `certificado_tecnico_ocupacion`, `prohibicion_enajenar_condicion_resolutoria`, `constituyente`, `beneficiarios`, `hipotecantes`, `acreedor`, `tipo_hipoteca`, `cuantia_credito`, `minuta_entidad` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F08, F10, F12, F23, F25, F27, F40, F41, F46, F62, F65. Fuente sugerida para la plantilla: F10. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Alta |
| A. Actos sobre inmuebles | [Compraventa de derechos de cuota (cuota parte)](fichas/compraventa_cuota.md) | ⚠️ Existe con problemas | F15, F54, F67, F69 | `vendedores`, `compradores`, `precio`, `forma_pago`, `afectacion_vivienda_familiar`, `gravamenes_subsistentes`, `constancia_redam`, `venta_cuerpo_cierto`, `porcentaje_o_fraccion`, `comuneros` | Independiente en: F15, F54, F67, F69. Fuente sugerida para la plantilla: F54. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Media |
| A. Actos sobre inmuebles | Compraventa de nuda propiedad / reserva de usufructo | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| A. Actos sobre inmuebles | [Compraventa de derechos herenciales o cesión de derechos herenciales](fichas/derechos_herenciales.md) | ⚠️ Existe con problemas | F33, F36, F50, F51 | `causante`, `parentesco_vendedor`, `modalidad`, `porcentaje` | Independiente en: F33, F36, F50, F51. Fuente sugerida para la plantilla: F50. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Media |
| A. Actos sobre inmuebles | [Hipoteca abierta (sin límite de cuantía) y cerrada](fichas/hipoteca.md) | ⚠️ Existe con problemas | F08, F12, F25, F27, F28, F46, F62, F65 | `hipotecantes`, `acreedor`, `tipo_hipoteca`, `cuantia_credito`, `minuta_entidad` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F08, F12, F25, F27, F28, F46, F62, F65. Fuente sugerida para la plantilla: F28. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Alta |
| A. Actos sobre inmuebles | [Cancelación de hipoteca](fichas/cancelacion_hipoteca.md) | ⚠️ Existe con problemas | F06, F16, F30, F32, F34 | `acreedor`, `representante_acreedor`, `deudor_hipotecante`, `escritura_hipoteca`, `valor_hipoteca`, `cuantia_acto`, `cancelacion_total_o_parcial` | Independiente en: F06, F16, F32, F34. Combinado en: F30. Fuente sugerida para la plantilla: F06. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Alta |
| A. Actos sobre inmuebles | Ampliación o modificación de hipoteca | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Media |
| A. Actos sobre inmuebles | [Liberación parcial de hipoteca (tipo encontrado)](fichas/liberacion_hipoteca.md) | ⚠️ Existe con problemas | F25 | `hipoteca_mayor_extension`, `unidad_liberada`, `valor_liberacion` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F25. Fuente sugerida para la plantilla: F25. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. Tipo no incluido en el catálogo base; encontrado en la carpeta. | Media |
| A. Actos sobre inmuebles | Permuta | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| A. Actos sobre inmuebles | Donación (incluida la insinuación notarial cuando aplique) | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Media |
| A. Actos sobre inmuebles | Dación en pago | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| A. Actos sobre inmuebles | Aporte de inmueble a sociedad | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| A. Actos sobre inmuebles | Constitución y cancelación de usufructo | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| A. Actos sobre inmuebles | Constitución de servidumbre | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| A. Actos sobre inmuebles | Englobe | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| A. Actos sobre inmuebles | Desenglobe / división material | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Media |
| A. Actos sobre inmuebles | Loteo / subdivisión | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| A. Actos sobre inmuebles | [Declaración de construcción o mejoras](fichas/declaracion_construccion.md) | ⚠️ Existe con problemas | F08, F47 | `construccion_descripcion`, `area_construida`, `valor_construccion`, `licencia_o_reconocimiento` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F08, F47. Fuente sugerida para la plantilla: F47. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Media |
| A. Actos sobre inmuebles | [Compraventa de mejoras / posesión (tipo encontrado)](fichas/compraventa_mejoras.md) | ⚠️ Existe con problemas | F20 | `vendedores`, `compradores`, `precio`, `forma_pago`, `afectacion_vivienda_familiar`, `gravamenes_subsistentes`, `constancia_redam`, `venta_cuerpo_cierto`, `descripcion_mejoras`, `predio_de_ubicacion` | Independiente en: F20. Fuente sugerida para la plantilla: F20. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. Tipo no incluido en el catálogo base; encontrado en la carpeta. | Media |
| A. Actos sobre inmuebles | Actualización o corrección de área y linderos | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Media |
| A. Actos sobre inmuebles | Reglamento de propiedad horizontal | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| A. Actos sobre inmuebles | Reforma del reglamento de propiedad horizontal | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| A. Actos sobre inmuebles | [Constitución de afectación a vivienda familiar](fichas/constitucion_afectacion.md) | ⚠️ Existe con problemas | F10, F11, F19, F23, F29, F35, F41 | `conyuges_o_companeros`, `declaracion_unico_inmueble` | Independiente en: F11, F29. Combinado en: F10, F19, F23, F35, F41. Fuente sugerida para la plantilla: F11. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Alta |
| A. Actos sobre inmuebles | [Cancelación de afectación a vivienda familiar](fichas/cancelacion_afectacion.md) | ⚠️ Existe con problemas | F01, F05, F14, F24, F28, F41, F56 | `titulo_afectacion`, `forma_afectacion`, `conyuges_o_companeros`, `causal` | Independiente en: F01, F14. Combinado en: F05, F24, F28, F41, F56. Fuente sugerida para la plantilla: F01. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Alta |
| A. Actos sobre inmuebles | [Constitución de patrimonio de familia inembargable](fichas/constitucion_patrimonio.md) | ⚠️ Existe con problemas | F08, F12, F25, F27, F40, F46, F62, F65 | `constituyente`, `beneficiarios` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F08, F12, F25, F27, F40, F46, F62, F65. Fuente sugerida para la plantilla: F40. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Media |
| A. Actos sobre inmuebles | [Cancelación de patrimonio de familia inembargable](fichas/cancelacion_patrimonio.md) | ⚠️ Existe con problemas | F02, F05, F13, F38, F47, F61, F64, F68 | `titulo_constitucion`, `beneficiarios`, `hijos_mayores_de_edad`, `estado_civil_constituyente` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F02, F05, F13, F38, F47, F61, F64, F68. Fuente sugerida para la plantilla: F13. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Alta |
| A. Actos sobre inmuebles | [Cancelación de condición resolutoria](fichas/cancelacion_condicion.md) | ⚠️ Existe con problemas | F13, F44, F56, F61, F64 | `titulo_origen`, `clausula`, `plazo_anios`, `anotacion_certificado`, `entidad_subsidio` | Independiente en: F44. Combinado en: F13, F56, F61, F64. Fuente sugerida para la plantilla: F44. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Alta |
| A. Actos sobre inmuebles | Fiducia mercantil sobre inmuebles | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| A. Actos sobre inmuebles | Leasing habitacional (transferencia o restitución) | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Media |
| A. Actos sobre inmuebles | [Aclaración o corrección de escritura](fichas/aclaracion.md) | ⚠️ Existe con problemas | F05, F48 | `escritura_aclarada`, `dato_erroneo`, `dato_correcto`, `soporte` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F05, F48. Fuente sugerida para la plantilla: F48. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Media |
| B. Familia y estado civil | Matrimonio civil | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Media |
| B. Familia y estado civil | Capitulaciones matrimoniales | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| B. Familia y estado civil | [Divorcio de matrimonio civil de mutuo acuerdo](fichas/divorcio_civil.md) | ⚠️ Existe con problemas | F03, F59 | `conyuges`, `matrimonio`, `hijos`, `acuerdo`, `oficios_registro` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F03, F59. Fuente sugerida para la plantilla: F59. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Media |
| B. Familia y estado civil | [Cesación de efectos civiles de matrimonio religioso de mutuo acuerdo](fichas/cesacion_efectos_civiles.md) | ⚠️ Existe con problemas | F05 | `conyuges`, `matrimonio`, `hijos`, `acuerdo`, `oficios_registro` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F05. Fuente sugerida para la plantilla: F05. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Media |
| B. Familia y estado civil | [Disolución y liquidación de sociedad conyugal](fichas/liquidacion_sociedad_conyugal.md) | ⚠️ Existe con problemas | F03, F05, F59 | `activos`, `pasivos`, `hijuelas`, `liquidacion_en_ceros` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F03, F05, F59. Fuente sugerida para la plantilla: F59. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Media |
| B. Familia y estado civil | [Declaración de unión marital de hecho y sociedad patrimonial](fichas/union_marital.md) | ⚠️ Existe con problemas | F45, F66 | `companeros`, `fecha_inicio_convivencia`, `impedimentos`, `hijos_con_bienes` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F45, F66. Fuente sugerida para la plantilla: F66. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Media |
| B. Familia y estado civil | [Disolución y liquidación de sociedad patrimonial](fichas/liquidacion_sociedad_patrimonial.md) | ⚠️ Existe con problemas | F45, F66 | `activos`, `pasivos`, `hijuelas`, `liquidacion_en_ceros` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F45, F66. Fuente sugerida para la plantilla: F66. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Media |
| B. Familia y estado civil | Reconocimiento de hijo extramatrimonial | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| B. Familia y estado civil | Cambio de nombre | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Media |
| B. Familia y estado civil | Corrección del registro civil | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Media |
| B. Familia y estado civil | Corrección del componente sexo en el registro civil | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| B. Familia y estado civil | [Autorización de salida del país de menor de edad (tipo encontrado)](fichas/salida_pais_menor.md) | ⚠️ Existe con problemas | F04, F07, F60 | `menor`, `otorgante`, `acompanante`, `paises`, `proposito`, `fecha_inicio`, `vigencia_hasta`, `aceptacion_acompanante`, `facultades_adicionales` | Independiente en: F04, F07, F60. Fuente sugerida para la plantilla: F07. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. Tipo no incluido en el catálogo base; encontrado en la carpeta. | Media |
| C. Sucesiones y testamentos | Sucesión intestada (liquidación de herencia) | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Alta |
| C. Sucesiones y testamentos | Sucesión testada | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Alta |
| C. Sucesiones y testamentos | Sucesión con liquidación de sociedad conyugal o patrimonial | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Alta |
| C. Sucesiones y testamentos | Testamento abierto | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Media |
| C. Sucesiones y testamentos | Testamento cerrado | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| C. Sucesiones y testamentos | Revocatoria de testamento | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| C. Sucesiones y testamentos | [Partición del patrimonio en vida (tipo encontrado)](fichas/particion_en_vida.md) | ⚠️ Existe con problemas | F71 | `asignante`, `licencia_judicial`, `bienes`, `pasivos`, `asignatarios`, `hijuelas` | Independiente en: F71. Fuente sugerida para la plantilla: F71. Con errores críticos: F71. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. Tipo no incluido en el catálogo base; encontrado en la carpeta. | Media |
| D. Poderes, apoyos y voluntad anticipada | Poder general | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Alta |
| D. Poderes, apoyos y voluntad anticipada | Poder especial por escritura pública | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Alta |
| D. Poderes, apoyos y voluntad anticipada | Revocatoria de poder | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Media |
| D. Poderes, apoyos y voluntad anticipada | Acuerdo de apoyo para la toma de decisiones | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Media |
| D. Poderes, apoyos y voluntad anticipada | [Terminación de acuerdo de apoyo (tipo encontrado)](fichas/terminacion_acuerdo_apoyo.md) | ⚠️ Existe con problemas | F72 | `titular_acto`, `acuerdo_apoyo`, `personas_apoyo` | Independiente en: F72. Fuente sugerida para la plantilla: F72. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. Tipo no incluido en el catálogo base; encontrado en la carpeta. | Baja |
| D. Poderes, apoyos y voluntad anticipada | [Directivas anticipadas](fichas/directivas_anticipadas.md) | ⚠️ Existe con problemas | F70 | `titular_acto`, `personas_apoyo`, `facultades`, `prohibiciones_salvaguardias`, `vigencia`, `ajustes_razonables`, `constancia_entrevista` | Independiente en: F70. Fuente sugerida para la plantilla: F70. Con errores críticos: F70. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Media |
| E. Sociedades y otros actos | Constitución de sociedad | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| E. Sociedades y otros actos | Reforma de estatutos | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| E. Sociedades y otros actos | Disolución y liquidación de sociedad | ❌ Falta |  |  | Solicitar a la notaría la minuta aprobada. | Baja |
| E. Sociedades y otros actos | [Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.)](fichas/protocolizacion.md) | ⚠️ Existe con problemas | F08, F25, F46, F65 | `documento_protocolizado` | No existe como escritura independiente: solo aparece combinado con otros actos. Combinado en: F08, F25, F46, F65. Fuente sugerida para la plantilla: F65. Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse. | Media |

## Inventario de archivos

Los nombres de archivo contienen nombres de clientes y abogados; aquí se muestran con iniciales entre corchetes. La correspondencia con el nombre real está solo en `datos_locales/fase0/MAPA_ARCHIVOS_REALES.md` (fuera del repositorio).

| ID | Nombre (alias) | Formato | Tamaño | Tipo(s) asignado(s) | ¿Duplicado? | Lectura | Variante |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | 1 - CASADOS - PODER | .docx | 33 KB | Cancelación de afectación a vivienda familiar | No | Completa | Cónyuges casados; uno comparece en nombre propio y como apoderado del otro. |
| F02 | 10 - CIUDADELA SALAMANCA LA NUEVA VIS - [N.C.C.G.] - CANCELACION PATRIMONIO - DR. [W.] | .docx | 96 KB | Cancelación de patrimonio de familia inembargable + Compraventa con constitución de hipoteca | No | Completa | Reventa de vivienda VIS; hipoteca a favor del Banco de Bogotá con minuta del banco. |
| F03 | 11 - MATRIMONIO CIVIL - LIQUIDACION EN 0 - HIJO MAYOR - PRESTA MERITO | .docx | 71 KB | Divorcio de matrimonio civil de mutuo acuerdo + Disolución y liquidación de sociedad conyugal | No | Completa | Con apoderado abogado; sociedad conyugal liquidada en ceros; acuerdo de alimentos con cláusula de mérito ejecutivo. |
| F04 | 12 - MENOR (1) - TODOS LOS PAISES | .docx | 39 KB | Autorización de salida del país de menor de edad (tipo encontrado) | No | Completa | Un menor, todos los países, con aceptación del acompañante. |
| F05 | 13 - CESACION Y LIQUIDACION CON BIENES - HIJOS MAYORES - CANCELAR PATRIMONIO - CANCELAR AFECTACION - DRA. [L.] | .docx | 81 KB | Cancelación de patrimonio de familia inembargable + Aclaración o corrección de escritura + Cancelación de afectación a vivienda familiar + Cesación de efectos civiles de matrimonio religioso de mutuo acuerdo + Disolución y liquidación de sociedad conyugal | No | Completa | Cesación con bienes ($17.000.000), hijos mayores, apoderada; incluye dos aclaraciones de nombre. |
| F06 | 14 - BBVA - [A.P.G.S.] | .docx | 34 KB | Cancelación de hipoteca | No | Completa | Cancelación de hipoteca de BBVA (minuta del banco). |
| F07 | 14 - MENOR (1) - PAISES EUROPA - SIN ACEPTACION | .docx | 35 KB | Autorización de salida del país de menor de edad (tipo encontrado) | No | Completa | Un menor, países de Europa, sin aceptación del acompañante. |
| F08 | 16 - SALAMANCA - BERDEZ - [M.V.V.] | .docx | 87 KB | Declaración de construcción o mejoras + Compraventa con subsidio de vivienda (VIS/VIP) + Hipoteca abierta (sin límite de cuantía) y cerrada + Constitución de patrimonio de familia inembargable + Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.) | No | Completa | Proyecto VIS con fiducia (Fiduciaria Central) y constructora; hipoteca BBVA; protocolización del certificado técnico de ocupación. |
| F09 | 2 - APARTAMENTO - SAN TELMO - [M.A.D.G.] - DR. [V.F.] | .docx | 72 KB | Compraventa con constitución de hipoteca | No | Completa | Apartamento en PH; hipoteca de primer grado para vivienda a favor del Banco Agrario (minuta del banco). |
| F10 | 2 - APARTAMENTO - TORRES DE IPACARAI - UNION LIBRE - CAJA HONOR - PODER | .docx | 59 KB | Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de afectación a vivienda familiar | No | Completa | Apartamento en PH; recursos de Caja Promotora de Vivienda Militar (Caja Honor); vendedora con apoderada; compradores en unión libre. |
| F11 | 2 - CASADOS - BIFAMILIAR ROSADO | .docx | 35 KB | Constitución de afectación a vivienda familiar | No | Completa | Afectación independiente por cónyuges casados; inmueble en PH (bifamiliar). |
| F12 | 2 - CONSTRUESPACIOS - VALLE DE SORENTO - [C.A.L.V.] - COLSUBSIDIO - DR. [R.] | .docx | 104 KB | Compraventa con subsidio de vivienda (VIS/VIP) + Hipoteca abierta (sin límite de cuantía) y cerrada + Constitución de patrimonio de familia inembargable | No | Completa | VIS con fiducia (Acción Fiduciaria) y Construespacios; subsidio Colsubsidio; hipoteca Bancolombia. |
| F13 | 2 - FUERON CASADOS (DIVORCIADOS) - CANCELACION CONDICION 5 AÑOS - CANCELACION PATRIMONIO - HIJOS MAYORES - PODER | .docx | 44 KB | Cancelación de condición resolutoria + Cancelación de patrimonio de familia inembargable | No | Completa | Excónyuges divorciados; uno con poder del otro; condición de 5 años; hijos mayores. |
| F14 | 2 - UNION LIBRE | .docx | 33 KB | Cancelación de afectación a vivienda familiar | No | Completa | Compañeros permanentes; afectación por ministerio de la ley. |
| F15 | 205 - LOTE SIN CONSTRUCCION - DERECHO CUOTA - [R.D.C.T. y E.M.M.S.] | .docx | 54 KB | Compraventa de derechos de cuota (cuota parte) | No | Completa | Derecho de cuota sobre lote. |
| F16 | 23 - BANCO DE BOGOTA | .docx | 26 KB | Cancelación de hipoteca | No | Completa | Cancelación total, sin cuantía (art. 23 Ley 546 de 1999), minuta del Banco de Bogotá. |
| F17 | 237 - RESERVAS DE ALCALA - PARQUEADERO (2) | .docx | 53 KB | Compraventa de inmueble | No | Completa | Dos parqueaderos en PH; vende sociedad (S.A.S.). |
| F18 | 255 - LOCAL - LOS COMUNEROS | .docx | 49 KB | Compraventa de inmueble | No | Completa | Local comercial en PH. |
| F19 | 26 - [D.F.P.M.] - DR. [J.] - INDAGACION | .docx | 66 KB | Compraventa con constitución de hipoteca + Constitución de afectación a vivienda familiar | No | Completa | Hipoteca BBVA; constancia de indagación: SÍ afecta a vivienda familiar. |
| F20 | 265 - MEJORAS INSCRITAS - [E.C.M.] | .docx | 42 KB | Compraventa de mejoras / posesión (tipo encontrado) | No | Completa | Venta de la posesión sobre mejoras inscritas; ORIP La Plata. |
| F21 | 285 - BODEGAS BLOQUE B - SURABASTOS | .docx | 43 KB | Compraventa de inmueble | No | Completa | Bodega en PH; menciona hipoteca a favor de CORPAVI de la cual se responsabiliza una parte. |
| F22 | 288 - LOTE SIN CONSTRUCCION - ADQUIEREN EN COMUNIDAD | .docx | 52 KB | Compraventa de inmueble | No | Completa | Lote; compradores en común y proindiviso. |
| F23 | 290 - CASA HABITACION - CASADO - CAJA HONOR (NUEVO) - PODER | .docx | 58 KB | Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de afectación a vivienda familiar | No | Completa | Recursos Caja Honor; comprador casado que afecta; vendedores representados; porcentajes de exógena. |
| F24 | 292 - CASA HABITACION - CANCELACION AFECTACION - COMPRA MENOR | .docx | 55 KB | Cancelación de afectación a vivienda familiar + Compraventa de inmueble | No | Completa | Compradora menor de edad representada por su madre. |
| F25 | 3 - ALTAIR APARTAMENTOS - (INVERSIONES DIAZ) - [Y.P.G.] - COMFAMILIAR | .docx | 87 KB | Liberación parcial de hipoteca (tipo encontrado) + Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.) + Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de patrimonio de familia inembargable + Hipoteca abierta (sin límite de cuantía) y cerrada | No | Completa | VIS con fiducia (Aval Fiduciaria); liberación parcial de hipoteca del Banco de Bogotá; hipoteca nueva a favor del Fondo Nacional del Ahorro; subsidio Comfamiliar. |
| F26 | 3 - CASA HABITACION - CASADA NO AFECTA - PODER | .docx | 51 KB | Compraventa de inmueble | No | Completa | Con poder; compradora casada que NO afecta (constancia de indagación). |
| F27 | 3 - CONSTRUESPACIOS - VALLE DE GENOVA - [H.J.P.V.] - COMFAMILIAR | .docx | 106 KB | Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de patrimonio de familia inembargable + Hipoteca abierta (sin límite de cuantía) y cerrada | No | Completa | VIS (Acción Fiduciaria/Construespacios); subsidio Comfamiliar; hipoteca Banco Caja Social. |
| F28 | 3 - UNION LIBRE - HIPOTECA PARTICULAR | .docx | 44 KB | Cancelación de afectación a vivienda familiar + Hipoteca abierta (sin límite de cuantía) y cerrada | No | Completa | Hipoteca abierta a favor de persona natural (acreedor particular), previa cancelación de afectación. |
| F29 | 3 - UNION LIBRE | .docx | 32 KB | Constitución de afectación a vivienda familiar | No | Completa | Afectación por compañeros permanentes; inmueble en Bogotá (ORIP Bogotá Zona Centro, matrícula 50C). |
| F30 | 306 - LOCAL - CENTRO COMERCIAL LAS AMERICAS - CANCELACION HIPOTECA BANCOLOMBIA - DRA. [A.M.] | .docx | 56 KB | Cancelación de hipoteca + Compraventa de inmueble | No | Completa | Cancelación de hipoteca Bancolombia + compraventa de local en PH. |
| F31 | 317 - LOTE SIN CONSTRUCCION - PORTAL DEL MONTE - VENDE SOCIEDAD | .docx | 50 KB | Compraventa de inmueble | No | Completa | Lote en condominio campestre (PH); vende sociedad por representante. |
| F32 | 32 - OCCIDENTE ABSORBIO LEASING DE OCCIDENTE S.A | .docx | 32 KB | Cancelación de hipoteca | No | Completa | Cancelación por Banco de Occidente como absorbente de Leasing de Occidente; con cuantía ($50.000.000); ORIP La Plata. |
| F33 | 336 - DERECHOS HERENCIALES UNIVERSAL - PORCENTAJE | .docx | 41 KB | Compraventa de derechos herenciales o cesión de derechos herenciales | No | Completa | Título universal por porcentaje. |
| F34 | 35 - BANCO MUNDO MUJER - [F.Z.A.] | .docx | 30 KB | Cancelación de hipoteca | No | Completa | Cancelación Banco Mundo Mujer; con cuantía ($166.000.000). |
| F35 | 354 - CASA - MULTIFAMILIAR PEREZ - CASADOS SI AFECTAN - [C.H.P.] | .docx | 50 KB | Compraventa de inmueble + Constitución de afectación a vivienda familiar | No | Completa | Casa en PH; compradores casados que SÍ afectan. |
| F36 | 364 - DERECHOS HERENCIALES UNIVERSAL | .docx | 46 KB | Compraventa de derechos herenciales o cesión de derechos herenciales | No | Completa | Título universal (hijo del causante). |
| F37 | 385 - CASA HABITACION - UNION LIBRE NO AFECTA | .docx | 50 KB | Compraventa de inmueble | No | Completa | Compradores en unión libre que NO afectan (constancia de indagación). |
| F38 | 388 - LOTE SIN CONSTRUCCION - CANCELACION PATRIMONIO | .docx | 58 KB | Cancelación de patrimonio de familia inembargable + Compraventa de inmueble | No | Completa | Cancelación de patrimonio previa a la venta. |
| F39 | 390 - LOTE SIN CONSTRUCCION - VENDE Y COMPRA SOCIEDAD - CONSTRUCCIONES SAN JOSE S.A.S - MANZANA 6 - PODER | .docx | 71 KB | Compraventa de inmueble | No | Completa | Sociedad vende a sociedad; condominio en PH; servidumbres; minuta presentada por las partes. |
| F40 | 392 - CONSTRUESPACIOS - VALLE DE SORENTO - [J.R.M.C.] - COLSUBSIDIO | .docx | 89 KB | Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de patrimonio de familia inembargable | No | Completa | VIS Colsubsidio sin hipoteca. |
| F41 | 393 - SAN AGUSTIN - CANCELACION AFECTACION - UNION LIBRE - CAJA HONOR (NUEVO) - PODER | .docx | 63 KB | Cancelación de afectación a vivienda familiar + Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de afectación a vivienda familiar | No | Completa | Recursos Caja Honor; inmueble en Cundinamarca (ORIP Agua de Dios); apoderada. |
| F42 | 399 - LOTE SIN CONSTRUCCION - PODER | .docx | 56 KB | Compraventa de inmueble | No | Completa | Vendedor y comprador comparecen por apoderados. |
| F43 | 4 - APARTAMENTO - PARQUEADERO - DEPOSITO - EDIFICIO CARRIZAL - [H.O.A.] - DR. [E.A.] | .docx | 77 KB | Compraventa con constitución de hipoteca | No | Completa | Tres inmuebles en PH (apartamento, parqueadero, depósito); hipoteca Banco Agrario. |
| F44 | 4 - CONDICION 2 AÑOS | .docx | 39 KB | Cancelación de condición resolutoria | No | Completa | Condición resolutoria de 2 años. |
| F45 | 4 - DECLARACION SOCIEDAD PATRIMONIAL - LIQUIDACION EN 0 - SIN HIJOS - [S.L.L.] | .docx | 69 KB | Declaración de unión marital de hecho y sociedad patrimonial + Disolución y liquidación de sociedad patrimonial | No | Completa | Declaración de sociedad patrimonial, cesación de la unión y liquidación en ceros; apoderado. |
| F46 | 4 - RDG CONSTRUCCIONES SAS ETAPA II - [J.R.C.] - COMFAMILIAR - DRA. [S.] | .docx | 79 KB | Compraventa con subsidio de vivienda (VIS/VIP) + Hipoteca abierta (sin límite de cuantía) y cerrada + Constitución de patrimonio de familia inembargable + Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.) | No | Completa | VIS RDG Construcciones; subsidio Comfamiliar; hipoteca Davivienda; protocolización de certificado técnico de ocupación. |
| F47 | 400 - CASA HABITACION - CANCELACION PATRIMONIO SOLTERA (HIJOS MAYORES) - DECLARACION CONSTRUCCION (RECONOCIMIENTO) - SOLTERA | .docx | 55 KB | Cancelación de patrimonio de familia inembargable + Declaración de construcción o mejoras + Compraventa de inmueble | No | Completa | Cancelación de patrimonio (hijos mayores), declaración de construcción por reconocimiento y venta. |
| F48 | 405 - CASA HABITACION - UNION LIBRE NO AFECTAN | .docx | 59 KB | Aclaración o corrección de escritura + Compraventa de inmueble | No | Completa | Tres aclaraciones de nombre + compraventa con 10 vendedores (10 % cada uno). |
| F49 | 406 - LOTE SIN CONSTRUCCION - [R.] (RIVERA) - LOTE 24 | .docx | 54 KB | Compraventa de inmueble | Sí – de F55 | Completa | Lote en Rivera. |
| F50 | 407 - DERECHOS HERENCIALES SINGULAR - ELABORO [C.] | .docx | 42 KB | Compraventa de derechos herenciales o cesión de derechos herenciales | No | Completa | Título singular sobre un inmueble determinado. |
| F51 | 408 - DERECHOS HERENCIALES UNIVERSAL - PADRES Y ABUELOS | .docx | 44 KB | Compraventa de derechos herenciales o cesión de derechos herenciales | No | Completa | Varios vendedores (12.5 % c/u); herencias de padres y abuelos. |
| F52 | 410 - CASA HABITACION - SOLTERA | .docx | 50 KB | Compraventa de inmueble | Tiene duplicado | Completa | Compraventa simple entre personas solteras; modelo base más limpio. |
| F53 | 413 - LOTE SIN CONSTRUCCION - UAF | .docx | 52 KB | Compraventa de inmueble | No | Completa | Predio rural con constancia de Unidad Agrícola Familiar (UAF). |
| F54 | 416 - LOTE SIN CONSTRUCCION - DERECHO CUOTA | .docx | 48 KB | Compraventa de derechos de cuota (cuota parte) | No | Completa | Derecho de cuota sobre lote urbano. |
| F55 | 417 - LOTE SIN CONSTRUCCION - [R.] (RIVERA) - LOTE 40 | .docx | 55 KB | Compraventa de inmueble | Sí – de F49 | Completa | Lote en Rivera. |
| F56 | 418 - CASA HABITACION - CANCELACION 2 AÑOS - CANCELACION AFECTACION - SOLTERO | .docx | 50 KB | Cancelación de condición resolutoria + Cancelación de afectación a vivienda familiar + Compraventa de inmueble | No | Completa | Condición de 2 años + cancelación de afectación + venta. |
| F57 | 419 - LOTE SIN CONSTRUCCION - (2) INMUEBLES - SABANA REAL ETAPA I | .docx | 49 KB | Compraventa de inmueble | No | Completa | Dos lotes en la misma escritura (dos matrículas). |
| F58 | 420 - CASA HABITACION - SOLTERA | .docx | 50 KB | Compraventa de inmueble | Sí – de F52 | Completa | Compraventa simple. |
| F59 | 5 - MATRIMONIO CIVIL - LIQUIDACION EN 0 - SIN HIJOS | .docx | 70 KB | Divorcio de matrimonio civil de mutuo acuerdo + Disolución y liquidación de sociedad conyugal | No | Completa | Divorcio sin hijos, liquidación en ceros, con apoderado; incluye oficios a notaría y registraduría. |
| F60 | 5 - MENOR (1) - TODOS LOS PAISES - EMPADRONAMIENTO - SIN ACEPTACION | .docx | 41 KB | Autorización de salida del país de menor de edad (tipo encontrado) | No | Completa | Todos los países; facultades de empadronamiento y trámites migratorios; sin aceptación. |
| F61 | 6 - CONDICION 5 AÑOS - CANCELACION PATRIMONIO - SOLTERA - HIJOS MAYORES | .docx | 49 KB | Cancelación de condición resolutoria + Cancelación de patrimonio de familia inembargable | No | Completa | Condición de 5 años (subsidio Comfamiliar) + patrimonio con hijos mayores. |
| F62 | 6 - CONSTRUESPACIOS - VALLE DE GENOVA - [M.M.G.M.] - COMFAMILIAR | .docx | 105 KB | Compraventa con subsidio de vivienda (VIS/VIP) + Constitución de patrimonio de familia inembargable + Hipoteca abierta (sin límite de cuantía) y cerrada | No | Completa | VIS (Acción Fiduciaria/Construespacios); subsidio Comfamiliar; hipoteca Davivienda. |
| F63 | 6 - SAN TELMO ETAPA 4 - [E.H.F.R.] - DR. [W.] | .docx | 96 KB | Compraventa con constitución de hipoteca | No | Completa | Apartamento en PH; hipoteca Banco de Bogotá (minuta del banco). |
| F64 | 7 - APARTAMENTO - ENTRE RIOS ETAPA I - CANCELACION CONDICION 5 AÑOS - CANCELACION PATRIMONIO SOLTERO - DR. [W.] | .docx | 104 KB | Cancelación de condición resolutoria + Cancelación de patrimonio de familia inembargable + Compraventa con constitución de hipoteca | No | Completa | Condición 5 años + patrimonio + compraventa + hipoteca Banco de Bogotá. |
| F65 | 7 - RDG CONSTRUCCIONES SAS ETAPA II - [Y.C.L.O.] - COLSUBSIDIO | .docx | 82 KB | Compraventa con subsidio de vivienda (VIS/VIP) + Hipoteca abierta (sin límite de cuantía) y cerrada + Constitución de patrimonio de familia inembargable + Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.) | No | Completa | VIS RDG Construcciones; subsidio Colsubsidio; hipoteca BBVA; protocolización de CTO. |
| F66 | 8 - (NUEVO) - DECLARACION UNION MARITAL - DECLARACION SOCIEDAD PATRIMONIAL - LIQUIDACION CON ACTIVOS | .docx | 84 KB | Declaración de unión marital de hecho y sociedad patrimonial + Disolución y liquidación de sociedad patrimonial | No | Completa | Declaración de UMH y sociedad patrimonial + liquidación con 8 partidas (inmuebles rurales y vehículos); apoderada. |
| F67 | 9 - LOTE SIN CONSTRUCCION - DERECHO CUOTA - ASOCIACION DE PEQUEÑOS PRODUCTORES … DE POTOSI | .docx | 49 KB | Compraventa de derechos de cuota (cuota parte) | No | Completa | Derecho de cuota; compra una asociación (entidad sin ánimo de lucro). |
| F68 | CANCELACION PATRIMONIO FAMILIA Y COMPRAVENTA [K.]2 | .docx | 38 KB | Cancelación de patrimonio de familia inembargable + Compraventa de inmueble | No | Completa | Cancelación de patrimonio con beneficiaria MENOR de edad (concepto ICBF) + compraventa de apartamento y parqueadero. |
| F69 | DERECHOS DE CUOTA CAMPOALEGRE [A. y M.C.] | .docx | 44 KB | Compraventa de derechos de cuota (cuota parte) | No | Completa | Cuota del 94.64 %; vendedora representada; hipoteca subsistente con advertencia notarial (art. 2433 C.C.). |
| F70 | ESCRI. DIRECTIVA ANTICIPADA Y ADJUDICACION DE APOYOS [J.] OK.2 | .docx | 38 KB | Directivas anticipadas | No | Completa | Directiva anticipada con designación de persona de apoyo (hija); facultades financieras y agropecuarias; entrevista notarial. |
| F71 | ESCRITURA SUCESION EN VIDA2 | .docx | 43 KB | Partición del patrimonio en vida (tipo encontrado) | No | Completa | Partición del patrimonio en vida con licencia judicial; 3 inmuebles; 2 hijuelas. NO es una sucesión (el nombre del archivo induce a error). |
| F72 | TERMINACION ACUERDO DE APOYO OK | .docx | 20 KB | Terminación de acuerdo de apoyo (tipo encontrado) | No | Completa | Terminación unilateral del acuerdo de apoyos (art. 20 Ley 1996 de 2019 citado). |

---

_Referencias normativas: ver cada ficha. Todas quedan como **"referencia normativa – pendiente de validar por el notario"**; esta checklist no afirma la vigencia de ninguna norma._
