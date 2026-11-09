-- Consumo de IA por revisión de escritura (panel Consumo de IA)
ALTER TABLE "consumo_ia" ADD COLUMN "revisionId" TEXT;
CREATE INDEX "consumo_ia_revisionId_idx" ON "consumo_ia"("revisionId");
