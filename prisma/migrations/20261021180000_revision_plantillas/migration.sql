-- Revisión de plantillas (verificación automática + IA) antes de la aprobación del notario
ALTER TABLE "plantillas" ADD COLUMN "revision" JSONB;
ALTER TABLE "plantillas" ADD COLUMN "revisadaEn" TIMESTAMP(3);
