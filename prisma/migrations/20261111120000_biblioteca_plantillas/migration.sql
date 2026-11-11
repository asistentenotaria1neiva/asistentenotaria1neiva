-- Nuevo sistema de escrituración: biblioteca de plantillas (escrituras modelo de la notaría) y escrituras
-- que se generan sobre la plantilla elegida con los documentos cargados.
-- Se ELIMINAN las plantillas por tipo, los expedientes (con sus documentos, análisis, observaciones,
-- borradores y correcciones) y las revisiones de escrituras del sistema anterior.
-- Antes de aplicarla, borre sus archivos cifrados del almacenamiento: scripts/limpiar-sistema-anterior.ts
-- La auditoría y el consumo de IA se conservan.

DROP TABLE IF EXISTS "datos_extraidos", "observaciones", "borradores", "correcciones", "analisis_ia",
  "comparecientes", "inmuebles", "documentos", "expedientes", "esquemas_formulario", "instrucciones_ia",
  "plantillas", "tipos_escritura", "revisiones_escritura" CASCADE;

DROP TYPE IF EXISTS "EstadoAprobacion";
DROP TYPE IF EXISTS "EstadoExpediente";
DROP TYPE IF EXISTS "Confianza";
DROP TYPE IF EXISTS "NivelObservacion";
DROP TYPE IF EXISTS "EstadoObservacion";


-- CreateTable
CREATE TABLE "plantillas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "subcategoria" TEXT,
    "anio" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "rutaCifrada" TEXT NOT NULL,
    "busqueda" TEXT NOT NULL,
    "caracteres" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "origen" TEXT NOT NULL DEFAULT 'CARGA_INICIAL',
    "cargadaPorId" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plantillas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expedientes" (
    "id" TEXT NOT NULL,
    "numeroInterno" TEXT NOT NULL,
    "titulo" TEXT,
    "plantillaId" TEXT,
    "plantillaNombre" TEXT NOT NULL,
    "plantillaRuta" TEXT,
    "observaciones" TEXT,
    "responsableId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "expedientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "paginas" INTEGER,
    "hashSha256" TEXT NOT NULL,
    "rutaCifrada" TEXT NOT NULL,
    "estadoLectura" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "lectura" JSONB,
    "errorLectura" TEXT,
    "subidoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generaciones" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'EN_CURSO',
    "error" TEXT,
    "progreso" JSONB,
    "resultado" JSONB,
    "observaciones" TEXT,
    "plantillaNombre" TEXT NOT NULL,
    "rutaDocx" TEXT,
    "hashSha256" TEXT,
    "modelo" TEXT,
    "generadaPorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_hashSha256_key" ON "plantillas"("hashSha256");
-- CreateIndex
CREATE INDEX "plantillas_categoria_anio_idx" ON "plantillas"("categoria", "anio");
-- CreateIndex
CREATE INDEX "plantillas_fecha_idx" ON "plantillas"("fecha");
-- CreateIndex
CREATE UNIQUE INDEX "expedientes_numeroInterno_key" ON "expedientes"("numeroInterno");
-- CreateIndex
CREATE INDEX "expedientes_responsableId_idx" ON "expedientes"("responsableId");
-- CreateIndex
CREATE INDEX "documentos_expedienteId_idx" ON "documentos"("expedienteId");
-- CreateIndex
CREATE UNIQUE INDEX "generaciones_expedienteId_version_key" ON "generaciones"("expedienteId", "version");

-- AddForeignKey
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_cargadaPorId_fkey" FOREIGN KEY ("cargadaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "plantillas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "generaciones" ADD CONSTRAINT "generaciones_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "generaciones" ADD CONSTRAINT "generaciones_generadaPorId_fkey" FOREIGN KEY ("generadaPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Como en 20261021120000_bloquear_api_publica: RLS sin políticas y sin acceso de la API pública de Supabase
ALTER TABLE "plantillas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expedientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "generaciones" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "plantillas", "expedientes", "documentos", "generaciones" FROM anon, authenticated;
  END IF;
END $$;
