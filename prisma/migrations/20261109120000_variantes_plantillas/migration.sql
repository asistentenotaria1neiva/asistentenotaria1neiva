-- Varias plantillas aprobadas por tipo de escritura (variantes por banco, obra, constructora…).
-- La IA elige la variante según los documentos del caso (src/lib/servicios/eleccion-plantilla.ts).
ALTER TABLE "tipos_escritura" ADD COLUMN "variantes" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plantillas" ADD COLUMN "variante" TEXT;
ALTER TABLE "plantillas" ADD COLUMN "criterios" TEXT;

-- La compraventa con hipoteca cambia de estructura según el banco o la obra
UPDATE "tipos_escritura" SET "variantes" = true WHERE "id" = 'compraventa_hipoteca';

-- La plantilla que ya estaba aprobada queda como una variante más (sin datos del caso en su nombre)
UPDATE "plantillas"
SET "variante" = 'Banco de Bogotá · RDG Construcciones Villa Lago Etapa I',
    "criterios" = 'Hipoteca abierta sin límite de cuantía a favor del BANCO DE BOGOTÁ S.A. Vende directamente RDG CONSTRUCCIONES S.A.S. (Conjunto Residencial Villa Lago Etapa I). Actos: compraventa, hipoteca, constitución de patrimonio de familia y protocolización del certificado técnico de ocupación. Casa nueva en conjunto residencial.'
WHERE "tipoId" = 'compraventa_hipoteca' AND "variante" IS NULL AND "nombreArchivo" ILIKE '%VILLA LAGO%';
