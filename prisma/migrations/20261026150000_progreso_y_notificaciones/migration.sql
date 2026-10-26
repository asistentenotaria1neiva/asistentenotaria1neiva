-- Avance y latido de los análisis en segundo plano (src/lib/servicios/tareas.ts)
ALTER TABLE "analisis_ia" ADD COLUMN "progreso" JSONB;
ALTER TABLE "analisis_ia" ADD COLUMN "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Notificaciones para los usuarios
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "enlace" TEXT,
    "leidaEn" TIMESTAMP(3),
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notificaciones_usuarioId_creadaEn_idx" ON "notificaciones"("usuarioId", "creadaEn");
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Como las demás tablas: sin acceso por la API pública de Supabase (ver 20261021120000_bloquear_api_publica)
ALTER TABLE "notificaciones" ENABLE ROW LEVEL SECURITY;
