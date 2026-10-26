-- Conversión automática de un caso real en plantilla: qué datos se cambiaron por variables
-- y los valores ficticios para ver la plantilla llenada (src/lib/servicios/variabilizar-plantilla.ts)
ALTER TABLE "plantillas" ADD COLUMN "variabilizacion" JSONB;
