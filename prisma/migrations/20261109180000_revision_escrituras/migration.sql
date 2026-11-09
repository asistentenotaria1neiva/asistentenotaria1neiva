-- Revisión de escrituras ya hechas: la IA recomienda cambios y el usuario elige cuáles aplicar
CREATE TABLE "revisiones_escritura" (
    "id" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "rutaOriginal" TEXT NOT NULL,
    "rutaCorregida" TEXT,
    "tipoId" TEXT,
    "notas" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'EN_CURSO',
    "error" TEXT,
    "resultado" JSONB,
    "modelo" TEXT,
    "cargadaPorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analizadaEn" TIMESTAMP(3),
    "aplicadaEn" TIMESTAMP(3),

    CONSTRAINT "revisiones_escritura_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "revisiones_escritura_cargadaPorId_creadaEn_idx" ON "revisiones_escritura"("cargadaPorId", "creadaEn");

ALTER TABLE "revisiones_escritura" ADD CONSTRAINT "revisiones_escritura_cargadaPorId_fkey" FOREIGN KEY ("cargadaPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Como las demás tablas: sin acceso por la API pública de Supabase (ver 20261021120000_bloquear_api_publica)
ALTER TABLE "revisiones_escritura" ENABLE ROW LEVEL SECURITY;
