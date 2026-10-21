-- AlterTable
ALTER TABLE "analisis_ia" ADD COLUMN     "documentoId" TEXT,
ADD COLUMN     "resultado" JSONB;

-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "estadoAnalisis" TEXT NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "hechos" JSONB;
