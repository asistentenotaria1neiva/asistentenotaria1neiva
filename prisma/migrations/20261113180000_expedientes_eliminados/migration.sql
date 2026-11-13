-- Escrituras borradas por el digitador: dejan de verse para él; el administrador las sigue viendo.

-- AlterTable
ALTER TABLE "expedientes" ADD COLUMN "eliminadoEn" TIMESTAMP(3),
ADD COLUMN "eliminadoPorId" TEXT;

-- CreateIndex
CREATE INDEX "expedientes_eliminadoEn_idx" ON "expedientes"("eliminadoEn");

-- AddForeignKey
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_eliminadoPorId_fkey" FOREIGN KEY ("eliminadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
