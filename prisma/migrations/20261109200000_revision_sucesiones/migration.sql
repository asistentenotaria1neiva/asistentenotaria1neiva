-- Revisión de escrituras de sucesión desde un PDF (escritura + soportes), por etapas en segundo plano
ALTER TABLE "revisiones_escritura" ADD COLUMN "paginas" INTEGER;
ALTER TABLE "revisiones_escritura" ADD COLUMN "rutaBase" TEXT;
ALTER TABLE "revisiones_escritura" ADD COLUMN "progreso" JSONB;
ALTER TABLE "revisiones_escritura" ADD COLUMN "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
