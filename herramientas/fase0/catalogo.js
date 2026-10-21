/**
 * FASE 0 – Catálogo de tipos de escritura y clasificación de los archivos de
 * la carpeta "Plantillas Notaria 1".
 *
 * Fuente única de verdad para generar:
 *   - docs/plantillas/CHECKLIST_PLANTILLAS.xlsx
 *   - docs/plantillas/CHECKLIST_PLANTILLAS.md
 *   - docs/plantillas/fichas/<tipo>.md
 *
 * La clasificación se hizo leyendo el CONTENIDO de cada archivo (carátula
 * "ESPECIFICACIÓN / VALOR DEL ACTO", títulos "PRIMER ACTO…", comparecientes y
 * cláusulas), no solo el nombre.
 *
 * Privacidad (Ley 1581 de 2012): los nombres de archivo originales contienen
 * nombres de clientes. Aquí cada archivo se identifica con un ID (F01…F72) y un
 * alias con iniciales. La correspondencia con el nombre real se genera solo en
 * datos_locales/ (excluida del repositorio).
 */

'use strict';

// ---------------------------------------------------------------------------
// Bloques de variables reutilizables (se usan en las fichas y los formularios)
// tipo: texto | entero | moneda | fecha | booleano | lista | enum | area | porcentaje
// ---------------------------------------------------------------------------
const V = (nombre, tipo, validacion, obligatorio = true) => ({ nombre, tipo, validacion, obligatorio });

const BLOQUES = {
  encabezado: [
    V('numero_escritura', 'entero', 'Asignado al protocolizar; se escribe en letras y en números automáticamente', false),
    V('fecha_otorgamiento', 'fecha', 'Se escribe en letras automáticamente ("CUATRO (04) DE AGOSTO DE DOS MIL VEINTISÉIS (2026)")', false),
    V('notario_autoriza', 'enum', 'TITULAR | ENCARGADO; si es encargado, exige resolución SNR del encargo'),
    V('resolucion_encargo', 'texto', 'Obligatoria cuando autoriza notario(a) encargado(a); formato "AAAA-NNNNNN-N del DD de MES de AAAA"', false),
    V('especificacion_actos', 'lista', 'Cada acto con su cuantía en pesos o "SIN CUANTÍA"; debe coincidir con los actos del cuerpo'),
    V('otorgamiento_diferentes_momentos', 'booleano', 'Art. 9 Decreto 2148 de 1983 (referencia citada en las minutas)', false),
  ],
  persona_natural: [
    V('nombre_completo', 'texto', 'MAYÚSCULAS; igual en carátula, cuerpo y firmas; coincidir con documento de identidad'),
    V('genero', 'enum', 'M | F – controla la concordancia (domiciliado/domiciliada, identificado/identificada)'),
    V('tipo_documento', 'enum', 'CC | CE | NUIP | TI | PASAPORTE'),
    V('numero_documento', 'texto', 'CC: 3 a 10 dígitos, con puntos de miles; igual en carátula, cuerpo y firmas'),
    V('lugar_expedicion', 'texto', 'Municipio de expedición del documento'),
    V('domicilio', 'texto', 'Municipio y abreviatura del departamento, p. ej. "Neiva (H)"'),
    V('estado_civil', 'enum', 'SOLTERO(A) SIN UNIÓN MARITAL | SOLTERO(A) CON UNIÓN MARITAL | CASADO(A) CON SOCIEDAD CONYUGAL VIGENTE | CASADO(A) CON SOCIEDAD CONYUGAL DISUELTA Y LIQUIDADA | DIVORCIADO(A) | VIUDO(A)'),
    V('actividad_economica', 'texto', 'Obligatoria (SARLAFT / formato de firmas)'),
    V('datos_firma', 'lista', 'Dirección, teléfono, e‑mail, PEP sí/no (Decreto 830 de 2021), nacionalidad – formato al pie', false),
  ],
  representacion: [
    V('apoderado', 'persona', 'Persona natural completa; si es abogado, tarjeta profesional'),
    V('apoderado_tarjeta_profesional', 'texto', 'Solo si el apoderado actúa como abogado (divorcios, UMH, partición)', false),
    V('tipo_poder', 'enum', 'ESPECIAL | GENERAL'),
    V('poder_soporte', 'texto', 'Escritura (número, fecha, notaría) o documento privado con presentación personal; certificado de vigencia si es poder por escritura'),
    V('facultades_poder', 'texto', 'La IA debe verificar que las facultades cubran el acto, el inmueble y la cuantía'),
  ],
  persona_juridica: [
    V('razon_social', 'texto', 'Igual al certificado de existencia y representación'),
    V('nit', 'texto', 'NNN.NNN.NNN-D con dígito de verificación válido (algoritmo DIAN)'),
    V('domicilio_principal', 'texto', ''),
    V('representante', 'persona', 'Representante legal o apoderado; verificar facultades y límites de cuantía'),
    V('certificado_existencia_fecha', 'fecha', 'Vigencia máxima a definir por el notario (pendiente)'),
  ],
  inmueble: [
    V('tipo_inmueble', 'enum', 'LOTE | CASA | APARTAMENTO | LOCAL | BODEGA | PARQUEADERO | DEPÓSITO | PREDIO RURAL | MEJORAS'),
    V('nombre_o_direccion', 'texto', 'Nomenclatura completa; igual en carátula y cuerpo'),
    V('municipio_departamento', 'texto', ''),
    V('area_terreno', 'area', 'Número con dos decimales + letras automáticas ("NOVENTA Y SIETE PUNTO CINCUENTA METROS CUADRADOS (97.50 M2)")', false),
    V('area_construida', 'area', 'Ídem', false),
    V('descripcion', 'texto', 'Descripción física / dependencias', false),
    V('linderos', 'texto', 'Por puntos cardinales; cruzar contra el certificado de tradición o el título anterior'),
    V('matricula_inmobiliaria', 'texto', 'Formato CCC-NNNNNN (círculo registral - número); igual en carátula, cuerpo y certificado'),
    V('oficina_registro', 'texto', 'ORIP del círculo (Neiva 200, La Plata 204, Pitalito 206, etc.)'),
    V('cedula_catastral', 'texto', '15, 20, 25 o 30 dígitos; indicar si está "involucrada" en mayor extensión'),
    V('cedula_catastral_paz_salvo', 'texto', 'Debe corresponder al mismo predio', false),
    V('propiedad_horizontal', 'booleano', 'Si aplica: escritura del reglamento (número, fecha, notaría), coeficiente y áreas privadas/comunes', false),
    V('matricula_matriz', 'texto', 'Solo si la catastral está en mayor extensión', false),
  ],
  tradicion: [
    V('modo_adquisicion', 'enum', 'COMPRA | ADJUDICACIÓN EN SUCESIÓN | ADJUDICACIÓN EN LIQUIDACIÓN | DONACIÓN | OTRO'),
    V('tradente_anterior', 'texto', 'Quién le transfirió al actual titular'),
    V('titulo_adquisicion', 'texto', 'Escritura número, fecha y notaría; debe coincidir con la anotación del certificado de tradición'),
    V('estado_civil_al_adquirir', 'enum', 'Mismo catálogo de estado civil', false),
  ],
  soportes_fiscales: [
    V('fecha_certificado_tradicion', 'fecha', 'Se transcribe en la cláusula "solicita e insiste…"; advertir antigüedad (umbral pendiente del notario)'),
    V('paz_salvo_predial', 'texto', 'Número de catastral, entidad, vigencia (fecha) y avalúo'),
    V('avaluo_catastral', 'moneda', 'Base para comparar con el precio', false),
    V('paz_salvo_valorizacion', 'texto', '', false),
  ],
  cierre: [
    V('hojas_papel_notarial', 'lista', 'Códigos Aa######### – se diligencian al imprimir', false),
    V('derechos_notariales', 'moneda', 'Derechos, IVA, Fondo, Superintendencia – se liquidan en caja', false),
    V('resolucion_tarifas', 'texto', 'Resolución de tarifas vigente del año (en 2026: "Resolución No. 2026-000964-6 del 20 de Enero de 2026")'),
    V('codigo_minuta', 'texto', 'Pie interno, p. ej. "COMPRAVENTA 410/ MILAN"', false),
  ],
};

// ---------------------------------------------------------------------------
// Variables específicas por tipo
// ---------------------------------------------------------------------------
const ESP = {
  compraventa: [
    V('vendedores', 'lista', 'Persona(s) natural(es) o jurídica(s); % de participación para exógena (suma 100 %)'),
    V('compradores', 'lista', 'Ídem; si es menor de edad, representación por quien ejerce patria potestad'),
    V('precio', 'moneda', 'Número → letras automáticas; comparar con avalúo catastral'),
    V('forma_pago', 'texto', 'Contado / crédito / subsidio / cesantías / ahorro; debe sumar el precio'),
    V('afectacion_vivienda_familiar', 'enum', 'NO APLICA (soltero) | SÍ AFECTA | NO AFECTA (con constancia de indagación) – Ley 258 de 1996'),
    V('gravamenes_subsistentes', 'texto', 'Si el certificado muestra hipoteca/embargo/patrimonio/condición vigente, debe cancelarse antes o declararse', false),
    V('constancia_redam', 'booleano', 'Constancia REDAM (Ley 2097 de 2021) para enajenantes'),
    V('venta_cuerpo_cierto', 'booleano', 'Parágrafo de cuerpo cierto', false),
  ],
  hipoteca: [
    V('hipotecantes', 'lista', 'Deudores/propietarios'),
    V('acreedor', 'persona/entidad', 'Banco, fondo o persona natural'),
    V('tipo_hipoteca', 'enum', 'ABIERTA SIN LÍMITE DE CUANTÍA | ABIERTA DE PRIMER GRADO PARA VIVIENDA | CERRADA'),
    V('cuantia_credito', 'moneda', 'Valor para derechos notariales; letras automáticas'),
    V('minuta_entidad', 'documento', 'Si el acreedor es entidad financiera, el texto lo aporta la entidad ("HASTA AQUÍ LA MINUTA PRESENTADA")', false),
  ],
  cancelacion_hipoteca: [
    V('acreedor', 'entidad', 'Banco o acreedor que cancela; NIT con DV'),
    V('representante_acreedor', 'persona', 'Apoderado del banco con poder vigente (escritura, fecha, notaría)'),
    V('deudor_hipotecante', 'persona', 'Quien constituyó la hipoteca'),
    V('escritura_hipoteca', 'texto', 'Número, fecha y notaría; cruzar con la anotación del certificado'),
    V('valor_hipoteca', 'moneda', 'Valor garantizado'),
    V('cuantia_acto', 'enum', 'SIN CUANTÍA (art. 23 Ley 546 de 1999) | CON CUANTÍA – según minuta del banco'),
    V('cancelacion_total_o_parcial', 'enum', 'TOTAL | PARCIAL (liberación)'),
  ],
  constitucion_afectacion: [
    V('conyuges_o_companeros', 'lista', 'Ambos deben comparecer'),
    V('declaracion_unico_inmueble', 'booleano', 'Declaración de no tener otro inmueble afectado'),
  ],
  cancelacion_afectacion: [
    V('titulo_afectacion', 'texto', 'Escritura que la constituyó (número, fecha, notaría)'),
    V('forma_afectacion', 'enum', 'POR MINISTERIO DE LA LEY | VOLUNTARIA'),
    V('conyuges_o_companeros', 'lista', 'Ambos deben consentir (personalmente o por apoderado)'),
    V('causal', 'texto', 'Común acuerdo (art. 4 Ley 258 de 1996) u otra causal'),
  ],
  constitucion_patrimonio: [
    V('constituyente', 'persona', ''),
    V('beneficiarios', 'texto', 'Constituyente, cónyuge/compañero, hijos menores y por nacer'),
  ],
  cancelacion_patrimonio: [
    V('titulo_constitucion', 'texto', 'Escritura que lo constituyó'),
    V('beneficiarios', 'lista', 'Nombre e identificación; edad (mayores/menores)'),
    V('hijos_mayores_de_edad', 'booleano', 'Si hay menores beneficiarios: exige trámite especial (Defensor/ICBF o juez) – alerta CRÍTICA'),
    V('estado_civil_constituyente', 'enum', 'Determina si comparece cónyuge/compañero'),
  ],
  cancelacion_condicion: [
    V('titulo_origen', 'texto', 'Escritura donde se pactó la condición'),
    V('clausula', 'texto', 'Número de la cláusula'),
    V('plazo_anios', 'entero', '2 o 5 años según el subsidio; verificar que ya transcurrió'),
    V('anotacion_certificado', 'texto', 'Número de anotación en el folio'),
    V('entidad_subsidio', 'texto', 'Caja de compensación / Fonvivienda / otra; acta u oficio de asignación', false),
  ],
  compraventa_vis: [
    V('vendedor_fiduciaria', 'entidad', 'Fiduciaria como vocera del patrimonio autónomo (NIT del fideicomiso)', false),
    V('fideicomitente_desarrollador', 'entidad', 'Constructora', false),
    V('subsidio_entidad', 'texto', 'Comfamiliar, Colsubsidio, Caja Honor, Mi Casa Ya, etc.'),
    V('subsidio_valor', 'moneda', ''),
    V('subsidio_acto_asignacion', 'texto', 'Acta/resolución/oficio y fecha'),
    V('recursos_propios_credito_cesantias', 'moneda', 'La suma de fuentes debe igualar el precio'),
    V('licencia_construccion', 'texto', 'Resolución de la curaduría', false),
    V('certificado_tecnico_ocupacion', 'texto', 'Se protocoliza cuando aplica (Ley 1796 de 2016 citada en las minutas)', false),
    V('prohibicion_enajenar_condicion_resolutoria', 'booleano', 'Cláusula de restitución del subsidio'),
  ],
  compraventa_cuota: [
    V('porcentaje_o_fraccion', 'porcentaje', 'Ej. 94.64 % o 1/11; la suma de cuotas no puede superar 100 %'),
    V('comuneros', 'lista', 'Titulares actuales según certificado'),
  ],
  derechos_herenciales: [
    V('causante', 'persona', 'Nombre, cédula, fecha y lugar de defunción'),
    V('parentesco_vendedor', 'texto', 'Calidad de heredero acreditada con registros civiles'),
    V('modalidad', 'enum', 'TÍTULO UNIVERSAL | TÍTULO SINGULAR (sobre inmueble determinado) | PORCENTAJE'),
    V('porcentaje', 'porcentaje', 'Si se vende un porcentaje', false),
  ],
  liberacion_hipoteca: [
    V('hipoteca_mayor_extension', 'texto', 'Escritura de la hipoteca sobre el lote matriz'),
    V('unidad_liberada', 'texto', 'Inmueble que se libera'),
    V('valor_liberacion', 'moneda', ''),
  ],
  declaracion_construccion: [
    V('construccion_descripcion', 'texto', ''),
    V('area_construida', 'area', ''),
    V('valor_construccion', 'moneda', ''),
    V('licencia_o_reconocimiento', 'texto', 'Resolución de curaduría/planeación'),
  ],
  aclaracion: [
    V('escritura_aclarada', 'texto', 'Número, fecha y notaría'),
    V('dato_erroneo', 'texto', ''),
    V('dato_correcto', 'texto', ''),
    V('soporte', 'texto', 'Registro civil, cédula, certificado de vigencia, etc.'),
  ],
  divorcio: [
    V('conyuges', 'lista', 'Ambos; con apoderado abogado (TP)'),
    V('matrimonio', 'texto', 'Fecha, lugar, notaría/registraduría/parroquia, indicativo serial'),
    V('hijos', 'lista', 'Mayores/menores; si hay menores: concepto del Defensor de Familia y acuerdo de custodia, visitas y alimentos'),
    V('acuerdo', 'texto', 'Residencia separada, alimentos entre cónyuges, alimentos a hijos (mérito ejecutivo si aplica)'),
    V('oficios_registro', 'lista', 'Registradurías/notarías donde están los registros de nacimiento y matrimonio'),
  ],
  liquidacion_sociedad: [
    V('activos', 'lista', 'Partidas con descripción, matrícula/placa, tradición y avalúo'),
    V('pasivos', 'lista', ''),
    V('hijuelas', 'lista', 'Adjudicación a cada parte; la suma debe igualar el activo líquido'),
    V('liquidacion_en_ceros', 'booleano', '"Sin repartir activos ni pasivos"'),
  ],
  union_marital: [
    V('companeros', 'lista', ''),
    V('fecha_inicio_convivencia', 'fecha', 'Mínimo 2 años para presumir sociedad patrimonial (validar con el notario)'),
    V('impedimentos', 'texto', 'Declaración de no tener vínculos/sociedades anteriores vigentes'),
    V('hijos_con_bienes', 'booleano', 'Si los hay, inventario solemne'),
  ],
  salida_pais: [
    V('menor', 'persona', 'Nombre, NUIP, registro civil de nacimiento'),
    V('otorgante', 'persona', 'Padre/madre que autoriza; acreditar patria potestad'),
    V('acompanante', 'persona', 'Quien viaja con el menor'),
    V('paises', 'lista', 'TODOS LOS PAÍSES | lista (p. ej. países de Europa)'),
    V('proposito', 'texto', 'Turismo, educación, residencia…'),
    V('fecha_inicio', 'fecha', ''),
    V('vigencia_hasta', 'fecha', 'No puede exceder la mayoría de edad del menor'),
    V('aceptacion_acompanante', 'booleano', 'Variante "sin aceptación"'),
    V('facultades_adicionales', 'texto', 'Empadronamiento, pasaportes, visados, etc.', false),
  ],
  directiva: [
    V('titular_acto', 'persona', 'Con fecha de nacimiento y dirección de residencia'),
    V('personas_apoyo', 'lista', 'Con parentesco'),
    V('facultades', 'texto', 'Financieras, inmobiliarias, agropecuarias, salud…'),
    V('prohibiciones_salvaguardias', 'texto', ''),
    V('vigencia', 'texto', ''),
    V('ajustes_razonables', 'booleano', 'Art. 24 Ley 1996 de 2019 (citado en la minuta)'),
    V('constancia_entrevista', 'texto', 'Entrevista separada del notario con cada compareciente'),
  ],
  terminacion_apoyo: [
    V('titular_acto', 'persona', ''),
    V('acuerdo_apoyo', 'texto', 'Escritura del acuerdo (número, fecha, notaría)'),
    V('personas_apoyo', 'lista', 'A quienes se comunica la terminación'),
  ],
  particion_vida: [
    V('asignante', 'persona', 'Comparece por apoderado abogado'),
    V('licencia_judicial', 'texto', 'Juzgado, radicado, fecha del acta y ejecutoria; plazo de 6 meses'),
    V('bienes', 'lista', 'Partidas con matrícula, catastral, tradición y avalúo'),
    V('pasivos', 'moneda', ''),
    V('asignatarios', 'lista', 'Con identificación'),
    V('hijuelas', 'lista', 'Valor y % por asignatario; deben sumar el activo total'),
  ],
  mejoras: [
    V('descripcion_mejoras', 'texto', 'Se transfiere la POSESIÓN, no el dominio'),
    V('predio_de_ubicacion', 'texto', 'Matrícula/catastral del predio donde están las mejoras'),
  ],
  protocolizacion: [
    V('documento_protocolizado', 'texto', 'Tipo, número, fecha y entidad (p. ej. certificado técnico de ocupación)'),
  ],
};

// ---------------------------------------------------------------------------
// Catálogo de tipos de escritura (base: sección 2.3 + tipos encontrados)
// prioridad: Alta | Media | Baja (frecuencia esperada; validar con el notario)
// ---------------------------------------------------------------------------
const T = (id, categoria, nombre, prioridad, extra = {}) => ({ id, categoria, nombre, prioridad, ...extra });
const A = 'A. Actos sobre inmuebles', B = 'B. Familia y estado civil', C = 'C. Sucesiones y testamentos',
  D = 'D. Poderes, apoyos y voluntad anticipada', E = 'E. Sociedades y otros actos';

const DOC_INMUEBLE = ['Certificado de tradición y libertad (reciente)', 'Paz y salvo predial y de valorización', 'Copia del título de adquisición', 'Documentos de identidad de los comparecientes'];

const TIPOS = [
  // A. Inmuebles
  T('compraventa', A, 'Compraventa de inmueble', 'Alta', { vars: ['compraventa'], soportes: [...DOC_INMUEBLE, 'Certificado de existencia y representación (si interviene persona jurídica)', 'Poder (si hay apoderado)', 'Registro civil de nacimiento (si compra/vende un menor)'], comparecientes: 'Vendedor(es), comprador(es), cónyuges/compañeros cuando aplica afectación, apoderados o representantes' }),
  T('compraventa_hipoteca', A, 'Compraventa con constitución de hipoteca', 'Alta', { vars: ['compraventa', 'hipoteca'], soportes: [...DOC_INMUEBLE, 'Minuta de la entidad financiera', 'Carta de aprobación del crédito', 'Poder y certificado del apoderado del banco'], comparecientes: 'Vendedor(es), comprador(es)-hipotecante(s), entidad acreedora por apoderado' }),
  T('compraventa_vis', A, 'Compraventa con subsidio de vivienda (VIS/VIP)', 'Alta', { vars: ['compraventa', 'compraventa_vis', 'constitucion_patrimonio', 'hipoteca'], soportes: [...DOC_INMUEBLE, 'Carta/acta de asignación del subsidio', 'Certificado de la fiduciaria y del fideicomiso', 'Licencia de construcción', 'Certificado técnico de ocupación (si aplica)', 'Minuta de la entidad financiera (si hay crédito)'], comparecientes: 'Fiduciaria (vocera del patrimonio autónomo), constructora/fideicomitente, comprador(es), entidad financiera' }),
  T('compraventa_cuota', A, 'Compraventa de derechos de cuota (cuota parte)', 'Media', { vars: ['compraventa', 'compraventa_cuota'], soportes: DOC_INMUEBLE, comparecientes: 'Comunero(s) vendedor(es), comprador(es)' }),
  T('compraventa_nuda_propiedad', A, 'Compraventa de nuda propiedad / reserva de usufructo', 'Baja'),
  T('derechos_herenciales', A, 'Compraventa de derechos herenciales o cesión de derechos herenciales', 'Media', { vars: ['derechos_herenciales'], soportes: ['Registro civil de defunción del causante', 'Registros civiles que acrediten parentesco', 'Documentos de identidad', 'Certificado de tradición (si es a título singular)'], comparecientes: 'Heredero(s) cedente(s), cesionario(s)' }),
  T('hipoteca', A, 'Hipoteca abierta (sin límite de cuantía) y cerrada', 'Alta', { vars: ['hipoteca'], soportes: [...DOC_INMUEBLE, 'Minuta de la entidad (si el acreedor es entidad financiera)'], comparecientes: 'Hipotecante(s), acreedor' }),
  T('cancelacion_hipoteca', A, 'Cancelación de hipoteca', 'Alta', { vars: ['cancelacion_hipoteca'], soportes: ['Minuta/carta de la entidad', 'Poder del apoderado del banco y certificado de vigencia', 'Certificado de existencia y representación de la entidad', 'Certificado de tradición'], comparecientes: 'Apoderado de la entidad acreedora' }),
  T('modificacion_hipoteca', A, 'Ampliación o modificación de hipoteca', 'Media'),
  T('liberacion_hipoteca', A, 'Liberación parcial de hipoteca (tipo encontrado)', 'Media', { nuevo: true, vars: ['liberacion_hipoteca'], soportes: ['Minuta del banco', 'Poder del apoderado del banco', 'Certificado de tradición del lote matriz y de la unidad'], comparecientes: 'Apoderado de la entidad acreedora' }),
  T('permuta', A, 'Permuta', 'Baja'),
  T('donacion', A, 'Donación (incluida la insinuación notarial cuando aplique)', 'Media'),
  T('dacion_pago', A, 'Dación en pago', 'Baja'),
  T('aporte_sociedad', A, 'Aporte de inmueble a sociedad', 'Baja'),
  T('usufructo', A, 'Constitución y cancelación de usufructo', 'Baja'),
  T('servidumbre', A, 'Constitución de servidumbre', 'Baja'),
  T('englobe', A, 'Englobe', 'Baja'),
  T('desenglobe', A, 'Desenglobe / división material', 'Media'),
  T('loteo', A, 'Loteo / subdivisión', 'Baja'),
  T('declaracion_construccion', A, 'Declaración de construcción o mejoras', 'Media', { vars: ['declaracion_construccion'], soportes: ['Licencia de construcción o acto de reconocimiento', 'Certificado de tradición', 'Paz y salvo predial'], comparecientes: 'Propietario(s)' }),
  T('compraventa_mejoras', A, 'Compraventa de mejoras / posesión (tipo encontrado)', 'Media', { nuevo: true, vars: ['compraventa', 'mejoras'], soportes: ['Documento que acredite la posesión/mejoras', 'Certificado de tradición del predio (si las mejoras están inscritas)', 'Documentos de identidad'], comparecientes: 'Poseedor vendedor, comprador' }),
  T('actualizacion_area', A, 'Actualización o corrección de área y linderos', 'Media'),
  T('reglamento_ph', A, 'Reglamento de propiedad horizontal', 'Baja'),
  T('reforma_ph', A, 'Reforma del reglamento de propiedad horizontal', 'Baja'),
  T('constitucion_afectacion', A, 'Constitución de afectación a vivienda familiar', 'Alta', { vars: ['constitucion_afectacion'], soportes: ['Certificado de tradición', 'Registro civil de matrimonio o prueba de la unión marital', 'Documentos de identidad'], comparecientes: 'Ambos cónyuges o compañeros permanentes' }),
  T('cancelacion_afectacion', A, 'Cancelación de afectación a vivienda familiar', 'Alta', { vars: ['cancelacion_afectacion'], soportes: ['Certificado de tradición', 'Documentos de identidad', 'Poder (si un cónyuge comparece por otro)'], comparecientes: 'Ambos cónyuges o compañeros permanentes' }),
  T('constitucion_patrimonio', A, 'Constitución de patrimonio de familia inembargable', 'Media', { vars: ['constitucion_patrimonio'], soportes: ['Certificado de tradición', 'Registros civiles de los beneficiarios'], comparecientes: 'Constituyente(s)' }),
  T('cancelacion_patrimonio', A, 'Cancelación de patrimonio de familia inembargable', 'Alta', { vars: ['cancelacion_patrimonio'], soportes: ['Certificado de tradición', 'Registros civiles de nacimiento de los beneficiarios', 'Concepto del Defensor de Familia / ICBF si hay beneficiarios menores', 'Documentos de identidad'], comparecientes: 'Constituyente(s) y cónyuge/compañero cuando aplica' }),
  T('cancelacion_condicion', A, 'Cancelación de condición resolutoria', 'Alta', { vars: ['cancelacion_condicion'], soportes: ['Certificado de tradición (anotación de la condición)', 'Escritura donde se pactó la condición', 'Oficio/acta de asignación del subsidio (si aplica)'], comparecientes: 'Propietario(s) actual(es)' }),
  T('fiducia', A, 'Fiducia mercantil sobre inmuebles', 'Baja'),
  T('leasing', A, 'Leasing habitacional (transferencia o restitución)', 'Media'),
  T('aclaracion', A, 'Aclaración o corrección de escritura', 'Media', { vars: ['aclaracion'], soportes: ['Escritura a aclarar', 'Documento que prueba el dato correcto'], comparecientes: 'Quienes otorgaron la escritura inicial (art. 35 Decreto 960 de 1970, citado en las minutas)' }),
  // B. Familia
  T('matrimonio_civil', B, 'Matrimonio civil', 'Media'),
  T('capitulaciones', B, 'Capitulaciones matrimoniales', 'Baja'),
  T('divorcio_civil', B, 'Divorcio de matrimonio civil de mutuo acuerdo', 'Media', { vars: ['divorcio'], soportes: ['Registro civil de matrimonio', 'Registros civiles de nacimiento de los cónyuges y de los hijos', 'Poder especial al abogado', 'Acuerdo y solicitud', 'Concepto del Defensor de Familia si hay hijos menores'], comparecientes: 'Abogado apoderado de ambos cónyuges (o los cónyuges)' }),
  T('cesacion_efectos_civiles', B, 'Cesación de efectos civiles de matrimonio religioso de mutuo acuerdo', 'Media', { vars: ['divorcio'], soportes: ['Registro civil de matrimonio y partida eclesiástica', 'Registros civiles de nacimiento', 'Poder especial al abogado', 'Acuerdo y solicitud'], comparecientes: 'Abogado apoderado de ambos cónyuges' }),
  T('liquidacion_sociedad_conyugal', B, 'Disolución y liquidación de sociedad conyugal', 'Media', { vars: ['liquidacion_sociedad'], soportes: ['Inventario y avalúo de bienes', 'Certificados de tradición de los bienes', 'Paz y salvos'], comparecientes: 'Cónyuges o su apoderado' }),
  T('union_marital', B, 'Declaración de unión marital de hecho y sociedad patrimonial', 'Media', { vars: ['union_marital'], soportes: ['Registros civiles de nacimiento', 'Poder especial (si hay apoderado)', 'Acuerdo y solicitud'], comparecientes: 'Compañeros permanentes o su apoderado' }),
  T('liquidacion_sociedad_patrimonial', B, 'Disolución y liquidación de sociedad patrimonial', 'Media', { vars: ['liquidacion_sociedad'], soportes: ['Inventario y avalúo', 'Certificados de tradición / tarjetas de propiedad', 'Paz y salvos'], comparecientes: 'Compañeros permanentes o su apoderado' }),
  T('reconocimiento_hijo', B, 'Reconocimiento de hijo extramatrimonial', 'Baja'),
  T('cambio_nombre', B, 'Cambio de nombre', 'Media'),
  T('correccion_registro_civil', B, 'Corrección del registro civil', 'Media'),
  T('correccion_sexo', B, 'Corrección del componente sexo en el registro civil', 'Baja'),
  T('salida_pais_menor', B, 'Autorización de salida del país de menor de edad (tipo encontrado)', 'Media', { nuevo: true, vars: ['salida_pais'], soportes: ['Registro civil de nacimiento del menor', 'Documentos de identidad del otorgante y del acompañante'], comparecientes: 'Padre o madre que autoriza; acompañante (si acepta)' }),
  // C. Sucesiones
  T('sucesion_intestada', C, 'Sucesión intestada (liquidación de herencia)', 'Alta'),
  T('sucesion_testada', C, 'Sucesión testada', 'Alta'),
  T('sucesion_con_liquidacion', C, 'Sucesión con liquidación de sociedad conyugal o patrimonial', 'Alta'),
  T('testamento_abierto', C, 'Testamento abierto', 'Media'),
  T('testamento_cerrado', C, 'Testamento cerrado', 'Baja'),
  T('revocatoria_testamento', C, 'Revocatoria de testamento', 'Baja'),
  T('particion_en_vida', C, 'Partición del patrimonio en vida (tipo encontrado)', 'Media', { nuevo: true, vars: ['particion_vida'], soportes: ['Licencia judicial ejecutoriada (acta de audiencia)', 'Trabajo de inventarios, avalúos y partición', 'Poder especial', 'Certificados de tradición', 'Paz y salvos'], comparecientes: 'Asignante (o su apoderado)' }),
  // D. Poderes y apoyos
  T('poder_general', D, 'Poder general', 'Alta'),
  T('poder_especial', D, 'Poder especial por escritura pública', 'Alta'),
  T('revocatoria_poder', D, 'Revocatoria de poder', 'Media'),
  T('acuerdo_apoyo', D, 'Acuerdo de apoyo para la toma de decisiones', 'Media'),
  T('terminacion_acuerdo_apoyo', D, 'Terminación de acuerdo de apoyo (tipo encontrado)', 'Baja', { nuevo: true, vars: ['terminacion_apoyo'], soportes: ['Escritura del acuerdo de apoyo', 'Solicitud', 'Documento de identidad'], comparecientes: 'Titular del acto' }),
  T('directivas_anticipadas', D, 'Directivas anticipadas', 'Media', { vars: ['directiva'], soportes: ['Documentos de identidad', 'Constancia de entrevista notarial'], comparecientes: 'Titular del acto y persona(s) de apoyo' }),
  // E. Sociedades y otros
  T('constitucion_sociedad', E, 'Constitución de sociedad', 'Baja'),
  T('reforma_estatutos', E, 'Reforma de estatutos', 'Baja'),
  T('liquidacion_sociedad_comercial', E, 'Disolución y liquidación de sociedad', 'Baja'),
  T('protocolizacion', E, 'Protocolizaciones (documentos, planos, licencias, sentencias, prescripción adquisitiva, etc.)', 'Media', { vars: ['protocolizacion'], soportes: ['Documento a protocolizar'], comparecientes: 'Interesado(s)' }),
];

// ---------------------------------------------------------------------------
// Inventario: clasificación de cada archivo por su contenido
// tipos: ids de TIPOS que contiene (en orden de aparición en la escritura)
// ---------------------------------------------------------------------------
// Los nombres de archivo reales contienen datos personales: viven solo en datos_locales/ (excluida del repositorio)
const RUTA_MAPA = require('path').resolve(__dirname, '..', '..', 'datos_locales', 'fase0', 'archivos_reales.json');
const MAPA_REAL = require('fs').existsSync(RUTA_MAPA) ? JSON.parse(require('fs').readFileSync(RUTA_MAPA, 'utf8')) : {};
const F = (id, alias, tipos, variante, problemas = [], extra = {}) => ({ id, archivo: MAPA_REAL[id], alias, tipos, variante, problemas, ...extra });

const ARCHIVOS = [
  F('F01', '1 - CASADOS - PODER', ['cancelacion_afectacion'], 'Cónyuges casados; uno comparece en nombre propio y como apoderado del otro.'),
  F('F02', '10 - CIUDADELA SALAMANCA LA NUEVA VIS - [N.C.C.G.] - CANCELACION PATRIMONIO - DR. [W.]', ['cancelacion_patrimonio', 'compraventa_hipoteca'], 'Reventa de vivienda VIS; hipoteca a favor del Banco de Bogotá con minuta del banco.', ['Minuta de hipoteca del Banco de Bogotá casi idéntica a F63 y F64 (82 % y 79 % de similitud).'], { grupo: 'G-BOGOTA' }),
  F('F03', '11 - MATRIMONIO CIVIL - LIQUIDACION EN 0 - HIJO MAYOR - PRESTA MERITO', ['divorcio_civil', 'liquidacion_sociedad_conyugal'], 'Con apoderado abogado; sociedad conyugal liquidada en ceros; acuerdo de alimentos con cláusula de mérito ejecutivo.', []),
  F('F04', '12 - MENOR (1) - TODOS LOS PAISES', ['salida_pais_menor'], 'Un menor, todos los países, con aceptación del acompañante.', ['La lista de países se repite 3 veces dentro del texto (sería una variable de lista).', 'Similar a F60 (64 %).']),
  F('F05', '13 - CESACION Y LIQUIDACION CON BIENES - HIJOS MAYORES - CANCELAR PATRIMONIO - CANCELAR AFECTACION - DRA. [L.]', ['cancelacion_patrimonio', 'aclaracion', 'cancelacion_afectacion', 'cesacion_efectos_civiles', 'liquidacion_sociedad_conyugal'], 'Cesación con bienes ($17.000.000), hijos mayores, apoderada; incluye dos aclaraciones de nombre.', []),
  F('F06', '14 - BBVA - [A.P.G.S.]', ['cancelacion_hipoteca'], 'Cancelación de hipoteca de BBVA (minuta del banco).'),
  F('F07', '14 - MENOR (1) - PAISES EUROPA - SIN ACEPTACION', ['salida_pais_menor'], 'Un menor, países de Europa, sin aceptación del acompañante.'),
  F('F08', '16 - SALAMANCA - BERDEZ - [M.V.V.]', ['declaracion_construccion', 'compraventa_vis', 'hipoteca', 'constitucion_patrimonio', 'protocolizacion'], 'Proyecto VIS con fiducia (Fiduciaria Central) y constructora; hipoteca BBVA; protocolización del certificado técnico de ocupación.', ['Compradora representada por apoderada.']),
  F('F09', '2 - APARTAMENTO - SAN TELMO - [M.A.D.G.] - DR. [V.F.]', ['compraventa_hipoteca'], 'Apartamento en PH; hipoteca de primer grado para vivienda a favor del Banco Agrario (minuta del banco).', [], { grupo: 'G-AGRARIO' }),
  F('F10', '2 - APARTAMENTO - TORRES DE IPACARAI - UNION LIBRE - CAJA HONOR - PODER', ['compraventa_vis', 'constitucion_afectacion'], 'Apartamento en PH; recursos de Caja Promotora de Vivienda Militar (Caja Honor); vendedora con apoderada; compradores en unión libre.', []),
  F('F11', '2 - CASADOS - BIFAMILIAR ROSADO', ['constitucion_afectacion'], 'Afectación independiente por cónyuges casados; inmueble en PH (bifamiliar).'),
  F('F12', '2 - CONSTRUESPACIOS - VALLE DE SORENTO - [C.A.L.V.] - COLSUBSIDIO - DR. [R.]', ['compraventa_vis', 'hipoteca', 'constitucion_patrimonio'], 'VIS con fiducia (Acción Fiduciaria) y Construespacios; subsidio Colsubsidio; hipoteca Bancolombia.', ['Misma minuta de constructora que F40 (59 %).']),
  F('F13', '2 - FUERON CASADOS (DIVORCIADOS) - CANCELACION CONDICION 5 AÑOS - CANCELACION PATRIMONIO - HIJOS MAYORES - PODER', ['cancelacion_condicion', 'cancelacion_patrimonio'], 'Excónyuges divorciados; uno con poder del otro; condición de 5 años; hijos mayores.', []),
  F('F14', '2 - UNION LIBRE', ['cancelacion_afectacion'], 'Compañeros permanentes; afectación por ministerio de la ley.', ['Similar a F01 (61 %).']),
  F('F15', '205 - LOTE SIN CONSTRUCCION - DERECHO CUOTA - [R.D.C.T. y E.M.M.S.]', ['compraventa_cuota'], 'Derecho de cuota sobre lote.'),
  F('F16', '23 - BANCO DE BOGOTA', ['cancelacion_hipoteca'], 'Cancelación total, sin cuantía (art. 23 Ley 546 de 1999), minuta del Banco de Bogotá.'),
  F('F17', '237 - RESERVAS DE ALCALA - PARQUEADERO (2)', ['compraventa'], 'Dos parqueaderos en PH; vende sociedad (S.A.S.).'),
  F('F18', '255 - LOCAL - LOS COMUNEROS', ['compraventa'], 'Local comercial en PH.'),
  F('F19', '26 - [D.F.P.M.] - DR. [J.] - INDAGACION', ['compraventa_hipoteca', 'constitucion_afectacion'], 'Hipoteca BBVA; constancia de indagación: SÍ afecta a vivienda familiar.'),
  F('F20', '265 - MEJORAS INSCRITAS - [E.C.M.]', ['compraventa_mejoras'], 'Venta de la posesión sobre mejoras inscritas; ORIP La Plata.'),
  F('F21', '285 - BODEGAS BLOQUE B - SURABASTOS', ['compraventa'], 'Bodega en PH; menciona hipoteca a favor de CORPAVI de la cual se responsabiliza una parte.', ['Encabezado cita al notario titular pero la firma es de la notaria encargada (verificar).', 'Hipoteca anterior mencionada: verificar que la plantilla no la traslade a otros casos.']),
  F('F22', '288 - LOTE SIN CONSTRUCCION - ADQUIEREN EN COMUNIDAD', ['compraventa'], 'Lote; compradores en común y proindiviso.'),
  F('F23', '290 - CASA HABITACION - CASADO - CAJA HONOR (NUEVO) - PODER', ['compraventa_vis', 'constitucion_afectacion'], 'Recursos Caja Honor; comprador casado que afecta; vendedores representados; porcentajes de exógena.', []),
  F('F24', '292 - CASA HABITACION - CANCELACION AFECTACION - COMPRA MENOR', ['cancelacion_afectacion', 'compraventa'], 'Compradora menor de edad representada por su madre.', ['En la carátula aparece "P. M. Q." con una cédula y "L. P. M. Q." con otra: verificar si son la misma persona (posible error de identificación).']),
  F('F25', '3 - ALTAIR APARTAMENTOS - (INVERSIONES DIAZ) - [Y.P.G.] - COMFAMILIAR', ['liberacion_hipoteca', 'protocolizacion', 'compraventa_vis', 'constitucion_patrimonio', 'hipoteca'], 'VIS con fiducia (Aval Fiduciaria); liberación parcial de hipoteca del Banco de Bogotá; hipoteca nueva a favor del Fondo Nacional del Ahorro; subsidio Comfamiliar.', []),
  F('F26', '3 - CASA HABITACION - CASADA NO AFECTA - PODER', ['compraventa'], 'Con poder; compradora casada que NO afecta (constancia de indagación).'),
  F('F27', '3 - CONSTRUESPACIOS - VALLE DE GENOVA - [H.J.P.V.] - COMFAMILIAR', ['compraventa_vis', 'constitucion_patrimonio', 'hipoteca'], 'VIS (Acción Fiduciaria/Construespacios); subsidio Comfamiliar; hipoteca Banco Caja Social.', ['Versión del mismo modelo que F62 (71 %); difieren en el banco.']),
  F('F28', '3 - UNION LIBRE - HIPOTECA PARTICULAR', ['cancelacion_afectacion', 'hipoteca'], 'Hipoteca abierta a favor de persona natural (acreedor particular), previa cancelación de afectación.', []),
  F('F29', '3 - UNION LIBRE', ['constitucion_afectacion'], 'Afectación por compañeros permanentes; inmueble en Bogotá (ORIP Bogotá Zona Centro, matrícula 50C).'),
  F('F30', '306 - LOCAL - CENTRO COMERCIAL LAS AMERICAS - CANCELACION HIPOTECA BANCOLOMBIA - DRA. [A.M.]', ['cancelacion_hipoteca', 'compraventa'], 'Cancelación de hipoteca Bancolombia + compraventa de local en PH.', ['Menciona otra hipoteca (Banco Popular) asumida por el vendedor: revisar.']),
  F('F31', '317 - LOTE SIN CONSTRUCCION - PORTAL DEL MONTE - VENDE SOCIEDAD', ['compraventa'], 'Lote en condominio campestre (PH); vende sociedad por representante.'),
  F('F32', '32 - OCCIDENTE ABSORBIO LEASING DE OCCIDENTE S.A', ['cancelacion_hipoteca'], 'Cancelación por Banco de Occidente como absorbente de Leasing de Occidente; con cuantía ($50.000.000); ORIP La Plata.', ['Doble espacio en el nombre del archivo.']),
  F('F33', '336 - DERECHOS HERENCIALES UNIVERSAL - PORCENTAJE', ['derechos_herenciales'], 'Título universal por porcentaje.', ['Versión del mismo modelo que F36 (75 %).']),
  F('F34', '35 - BANCO MUNDO MUJER - [F.Z.A.]', ['cancelacion_hipoteca'], 'Cancelación Banco Mundo Mujer; con cuantía ($166.000.000).', ['Unas cancelaciones van "sin cuantía" y otras "con cuantía": el notario debe fijar el criterio.']),
  F('F35', '354 - CASA - MULTIFAMILIAR PEREZ - CASADOS SI AFECTAN - [C.H.P.]', ['compraventa', 'constitucion_afectacion'], 'Casa en PH; compradores casados que SÍ afectan.', []),
  F('F36', '364 - DERECHOS HERENCIALES UNIVERSAL', ['derechos_herenciales'], 'Título universal (hijo del causante).', ['Error en la fecha: "VEITISEIS".']),
  F('F37', '385 - CASA HABITACION - UNION LIBRE NO AFECTA', ['compraventa'], 'Compradores en unión libre que NO afectan (constancia de indagación).', ['Error en la fecha: "VEITNISEIS".']),
  F('F38', '388 - LOTE SIN CONSTRUCCION - CANCELACION PATRIMONIO', ['cancelacion_patrimonio', 'compraventa'], 'Cancelación de patrimonio previa a la venta.', []),
  F('F39', '390 - LOTE SIN CONSTRUCCION - VENDE Y COMPRA SOCIEDAD - CONSTRUCCIONES SAN JOSE S.A.S - MANZANA 6 - PODER', ['compraventa'], 'Sociedad vende a sociedad; condominio en PH; servidumbres; minuta presentada por las partes.', []),
  F('F40', '392 - CONSTRUESPACIOS - VALLE DE SORENTO - [J.R.M.C.] - COLSUBSIDIO', ['compraventa_vis', 'constitucion_patrimonio'], 'VIS Colsubsidio sin hipoteca.', []),
  F('F41', '393 - SAN AGUSTIN - CANCELACION AFECTACION - UNION LIBRE - CAJA HONOR (NUEVO) - PODER', ['cancelacion_afectacion', 'compraventa_vis', 'constitucion_afectacion'], 'Recursos Caja Honor; inmueble en Cundinamarca (ORIP Agua de Dios); apoderada.', []),
  F('F42', '399 - LOTE SIN CONSTRUCCION - PODER', ['compraventa'], 'Vendedor y comprador comparecen por apoderados.'),
  F('F43', '4 - APARTAMENTO - PARQUEADERO - DEPOSITO - EDIFICIO CARRIZAL - [H.O.A.] - DR. [E.A.]', ['compraventa_hipoteca'], 'Tres inmuebles en PH (apartamento, parqueadero, depósito); hipoteca Banco Agrario.', [], { grupo: 'G-AGRARIO' }),
  F('F44', '4 - CONDICION 2 AÑOS', ['cancelacion_condicion'], 'Condición resolutoria de 2 años.'),
  F('F45', '4 - DECLARACION SOCIEDAD PATRIMONIAL - LIQUIDACION EN 0 - SIN HIJOS - [S.L.L.]', ['union_marital', 'liquidacion_sociedad_patrimonial'], 'Declaración de sociedad patrimonial, cesación de la unión y liquidación en ceros; apoderado.', ['Cita la resolución de tarifas de 2025 (versión anterior).']),
  F('F46', '4 - RDG CONSTRUCCIONES SAS ETAPA II - [J.R.C.] - COMFAMILIAR - DRA. [S.]', ['compraventa_vis', 'hipoteca', 'constitucion_patrimonio', 'protocolizacion'], 'VIS RDG Construcciones; subsidio Comfamiliar; hipoteca Davivienda; protocolización de certificado técnico de ocupación.', ['Mismo modelo de constructora que F65.']),
  F('F47', '400 - CASA HABITACION - CANCELACION PATRIMONIO SOLTERA (HIJOS MAYORES) - DECLARACION CONSTRUCCION (RECONOCIMIENTO) - SOLTERA', ['cancelacion_patrimonio', 'declaracion_construccion', 'compraventa'], 'Cancelación de patrimonio (hijos mayores), declaración de construcción por reconocimiento y venta.', ['Error en la fecha: "SESIS (06)".']),
  F('F48', '405 - CASA HABITACION - UNION LIBRE NO AFECTAN', ['aclaracion', 'compraventa'], 'Tres aclaraciones de nombre + compraventa con 10 vendedores (10 % cada uno).', []),
  F('F49', '406 - LOTE SIN CONSTRUCCION - [R.] (RIVERA) - LOTE 24', ['compraventa'], 'Lote en Rivera.', ['Duplicado casi exacto de F55 (83 %): mismo vendedor, distinto lote.'], { duplicadoDe: 'F55' }),
  F('F50', '407 - DERECHOS HERENCIALES SINGULAR - ELABORO [C.]', ['derechos_herenciales'], 'Título singular sobre un inmueble determinado.'),
  F('F51', '408 - DERECHOS HERENCIALES UNIVERSAL - PADRES Y ABUELOS', ['derechos_herenciales'], 'Varios vendedores (12.5 % c/u); herencias de padres y abuelos.'),
  F('F52', '410 - CASA HABITACION - SOLTERA', ['compraventa'], 'Compraventa simple entre personas solteras; modelo base más limpio.', ['Versión del mismo modelo que F58 (70 %).'], { canonico: true }),
  F('F53', '413 - LOTE SIN CONSTRUCCION - UAF', ['compraventa'], 'Predio rural con constancia de Unidad Agrícola Familiar (UAF).'),
  F('F54', '416 - LOTE SIN CONSTRUCCION - DERECHO CUOTA', ['compraventa_cuota'], 'Derecho de cuota sobre lote urbano.', [], { canonico: true }),
  F('F55', '417 - LOTE SIN CONSTRUCCION - [R.] (RIVERA) - LOTE 40', ['compraventa'], 'Lote en Rivera.', ['Duplicado casi exacto de F49 (83 %).'], { duplicadoDe: 'F49' }),
  F('F56', '418 - CASA HABITACION - CANCELACION 2 AÑOS - CANCELACION AFECTACION - SOLTERO', ['cancelacion_condicion', 'cancelacion_afectacion', 'compraventa'], 'Condición de 2 años + cancelación de afectación + venta.', []),
  F('F57', '419 - LOTE SIN CONSTRUCCION - (2) INMUEBLES - SABANA REAL ETAPA I', ['compraventa'], 'Dos lotes en la misma escritura (dos matrículas).'),
  F('F58', '420 - CASA HABITACION - SOLTERA', ['compraventa'], 'Compraventa simple.', ['Duplicado/versión de F52 (70 %).'], { duplicadoDe: 'F52' }),
  F('F59', '5 - MATRIMONIO CIVIL - LIQUIDACION EN 0 - SIN HIJOS', ['divorcio_civil', 'liquidacion_sociedad_conyugal'], 'Divorcio sin hijos, liquidación en ceros, con apoderado; incluye oficios a notaría y registraduría.', [], { canonico: true }),
  F('F60', '5 - MENOR (1) - TODOS LOS PAISES - EMPADRONAMIENTO - SIN ACEPTACION', ['salida_pais_menor'], 'Todos los países; facultades de empadronamiento y trámites migratorios; sin aceptación.'),
  F('F61', '6 - CONDICION 5 AÑOS - CANCELACION PATRIMONIO - SOLTERA - HIJOS MAYORES', ['cancelacion_condicion', 'cancelacion_patrimonio'], 'Condición de 5 años (subsidio Comfamiliar) + patrimonio con hijos mayores.', []),
  F('F62', '6 - CONSTRUESPACIOS - VALLE DE GENOVA - [M.M.G.M.] - COMFAMILIAR', ['compraventa_vis', 'constitucion_patrimonio', 'hipoteca'], 'VIS (Acción Fiduciaria/Construespacios); subsidio Comfamiliar; hipoteca Davivienda.', ['Versión del mismo modelo que F27 (71 %).']),
  F('F63', '6 - SAN TELMO ETAPA 4 - [E.H.F.R.] - DR. [W.]', ['compraventa_hipoteca'], 'Apartamento en PH; hipoteca Banco de Bogotá (minuta del banco).', ['Mismo modelo que F02 y F64.'], { grupo: 'G-BOGOTA', canonico: true }),
  F('F64', '7 - APARTAMENTO - ENTRE RIOS ETAPA I - CANCELACION CONDICION 5 AÑOS - CANCELACION PATRIMONIO SOLTERO - DR. [W.]', ['cancelacion_condicion', 'cancelacion_patrimonio', 'compraventa_hipoteca'], 'Condición 5 años + patrimonio + compraventa + hipoteca Banco de Bogotá.', ['Mismo modelo bancario que F02 y F63.'], { grupo: 'G-BOGOTA' }),
  F('F65', '7 - RDG CONSTRUCCIONES SAS ETAPA II - [Y.C.L.O.] - COLSUBSIDIO', ['compraventa_vis', 'hipoteca', 'constitucion_patrimonio', 'protocolizacion'], 'VIS RDG Construcciones; subsidio Colsubsidio; hipoteca BBVA; protocolización de CTO.', []),
  F('F66', '8 - (NUEVO) - DECLARACION UNION MARITAL - DECLARACION SOCIEDAD PATRIMONIAL - LIQUIDACION CON ACTIVOS', ['union_marital', 'liquidacion_sociedad_patrimonial'], 'Declaración de UMH y sociedad patrimonial + liquidación con 8 partidas (inmuebles rurales y vehículos); apoderada.', ['Se verificó la suma de hijuelas: cuadra ($231.838.000 + $25.000.000 = $256.838.000).'], { canonico: true }),
  F('F67', '9 - LOTE SIN CONSTRUCCION - DERECHO CUOTA - ASOCIACION DE PEQUEÑOS PRODUCTORES … DE POTOSI', ['compraventa_cuota'], 'Derecho de cuota; compra una asociación (entidad sin ánimo de lucro).', ['El pie no tiene código de minuta.']),
  F('F68', 'CANCELACION PATRIMONIO FAMILIA Y COMPRAVENTA [K.]2', ['cancelacion_patrimonio', 'compraventa'], 'Cancelación de patrimonio con beneficiaria MENOR de edad (concepto ICBF) + compraventa de apartamento y parqueadero.', ['Formato distinto al estándar de la notaría (elaborado por otra persona).', 'Cifra mal escrita: "$150.000. 000.oo".', 'Cancelación con beneficiaria menor: la sustitución del patrimonio queda para otra escritura – requiere validación jurídica del notario.', 'Títulos de actos: aparece "PRIMER ACTO" y "TERCER ACTO" (revisar numeración).']),
  F('F69', 'DERECHOS DE CUOTA CAMPOALEGRE [A. y M.C.]', ['compraventa_cuota'], 'Cuota del 94.64 %; vendedora representada; hipoteca subsistente con advertencia notarial (art. 2433 C.C.).', ['Formato distinto al estándar (otro elaborador).', 'Doble espacio en el nombre del archivo.']),
  F('F70', 'ESCRI. DIRECTIVA ANTICIPADA Y ADJUDICACION DE APOYOS [J.] OK.2', ['directivas_anticipadas'], 'Directiva anticipada con designación de persona de apoyo (hija); facultades financieras y agropecuarias; entrevista notarial.', ['CRÍTICO: la cédula del titular en la carátula no coincide con la del cuerpo (difieren todos los dígitos).', 'Estado civil del titular y de la persona de apoyo sin diligenciar.', 'Cita la resolución de tarifas de 2024 (desactualizada).', 'Falta el formato PEP en las firmas.', 'Contiene número de cuenta bancaria real.']),
  F('F71', 'ESCRITURA SUCESION EN VIDA2', ['particion_en_vida'], 'Partición del patrimonio en vida con licencia judicial; 3 inmuebles; 2 hijuelas. NO es una sucesión (el nombre del archivo induce a error).', ['CRÍTICO: total de la hijuela segunda escrito como "$466.8666.000" (cifra mal formada y además debería ser $963.169.500).', 'Errores: "TOAL ADJUDICADO", "ADJUDICAICÓN", numeral "6.1.2" repetido en la segunda hijuela.', 'Llama "causante" a la asignante, que está viva.', 'Concordancia: "domiciliada" para el apoderado (hombre).', 'Estado civil y actividad económica de la asignante sin diligenciar; día de otorgamiento "(__)".', 'Falta la resolución de tarifas y el formato PEP.']),
  F('F72', 'TERMINACION ACUERDO DE APOYO OK', ['terminacion_acuerdo_apoyo'], 'Terminación unilateral del acuerdo de apoyos (art. 20 Ley 1996 de 2019 citado).', ['Fecha, domicilio y actividad económica sin diligenciar.', 'Texto arrastrado de otra minuta: "aceptan… la MODIFICACIÓN".', 'Error de digitación: "identificadasmanifiestan".']),
];

module.exports = { BLOQUES, ESP, TIPOS, ARCHIVOS };
