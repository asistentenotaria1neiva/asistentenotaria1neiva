-- Se retiran todos los actos menos la compraventa: se borran sus plantillas (todas las versiones,
-- incluidas las cargadas o corregidas desde la aplicación) y sus esquemas de formulario.
-- Se conservan la compraventa y los bloques comunes (carátula, cierre y oficios de registro).
-- Los tipos de escritura siguen en el catálogo, ahora sin plantilla.
DELETE FROM "plantillas" WHERE "tipoId" IN (
  'cancelacion_afectacion', 'cancelacion_condicion', 'cancelacion_hipoteca', 'cancelacion_patrimonio',
  'constitucion_afectacion', 'derechos_herenciales', 'divorcio_civil', 'salida_pais_menor'
);
DELETE FROM "esquemas_formulario" WHERE "tipoId" IN (
  'cancelacion_afectacion', 'cancelacion_condicion', 'cancelacion_hipoteca', 'cancelacion_patrimonio',
  'constitucion_afectacion', 'derechos_herenciales', 'divorcio_civil', 'salida_pais_menor'
);
