-- Un PDF con varios documentos se separa en partes: cada parte guarda el documento y las páginas de donde salió
ALTER TABLE "documentos" ADD COLUMN "origenId" TEXT;
ALTER TABLE "documentos" ADD COLUMN "paginaDesde" INTEGER;
ALTER TABLE "documentos" ADD COLUMN "paginaHasta" INTEGER;
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
