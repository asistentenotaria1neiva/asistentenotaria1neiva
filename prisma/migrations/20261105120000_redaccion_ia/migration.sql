-- Las plantillas pasan a ser modelos de redacción (sin variables): la IA redacta cada escritura sobre ellas.
-- El borrador guarda el resumen, los datos faltantes y las advertencias de esa redacción.
ALTER TABLE "borradores" ADD COLUMN "redaccion" JSONB;
-- La conversión de casos reales en plantillas con variables ya no existe
ALTER TABLE "plantillas" DROP COLUMN "variabilizacion";
